/* ═══════════════════════════════════════════
   chat 路由 — 发送消息(润色 + 生图 + 落盘)
   改造点:基于 session 多轮上下文
   - 历史 user/assistant 文本作为上下文喂给润色模型
   - 结果追加到 session 并持久化
   ═══════════════════════════════════════════ */

import { Router } from 'express';
import type {
  ApiEnvelope,
  ChatGenerateRequest,
  ChatGenerateResponse,
  ChatMessage,
} from '@shared/types';
import type { HistoryTurn } from '../services/qwen.api';
import { multimodalRefine, generateImages } from '../services/qwen.api';
import { runAgent } from '../services/agent.runner';
import {
  register,
  unregister,
  getConn,
  emitEvent,
  sendComment,
  type SseConnection,
} from '../services/sse.registry';
import {
  getActiveApiKey,
  loadFullConfig,
} from '../services/config.service';
import {
  getSession,
  ensureLatestSession,
  appendMessages,
} from '../services/session.service';
import { storage } from '../services/storage.service';
import { logger } from '../utils/logger';

export const chatRouter = Router();

interface ChatSendBody {
  clientId?: string;
  turnId?: string;
  sessionId?: string;
  userText?: string;
  imageBase64?: string;
}

let _msgId = 0;
function nextMsgId(): string {
  return `msg_${Date.now()}_${++_msgId}`;
}

/* 占位/欢迎/思考消息 — 不计入上下文 */
function isPlaceholder(m: ChatMessage): boolean {
  if (m.role === 'user') return false;
  return (
    m.content.startsWith('🤔') ||
    m.content.startsWith('你好!') ||
    m.content.startsWith('❌')
  );
}

/* 历史净化:剥掉后端注入的格式化标记行(🎨/✅),
   防止模型模仿这些文字"假装生图"而不调用工具 */
function sanitizeForHistory(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^🎨\s*(正在为你生成图片|生图提示词)/.test(line))
    .filter((line) => !/^✅\s*已生成\s*\d+\s*张图片/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 从会话历史构造多轮文本上下文(最多最近 6 轮,净化后端标记) */
function buildHistory(session: { messages: ChatMessage[] }): HistoryTurn[] {
  return session.messages
    .filter((m) => !isPlaceholder(m))
    .slice(-6)
    .map((m) => ({ role: m.role, content: sanitizeForHistory(m.content) }))
    .filter((m) => m.content.length > 0);
}

chatRouter.post('/generate', async (req, res, next) => {
  try {
    const { sessionId, userText, imageBase64, imageCount } =
      req.body as ChatGenerateRequest;
    logger.info('chat', 'POST /generate (legacy)', {
      sessionId: sessionId ?? '(none)',
      userText: logger.pv(userText, 60),
      imageCount,
      hasImage: !!imageBase64,
    });

    if (!userText && !imageBase64) {
      res.status(400).json({ success: false, error: '消息不能为空' });
      return;
    }

    const apiKey = getActiveApiKey();
    if (!apiKey) {
      res
        .status(400)
        .json({ success: false, error: '请先在设置中配置 API Key' });
      return;
    }

    /* 1. 解析会话(指定 id 或最新/新建) */
    const session =
      (sessionId ? getSession(sessionId) : null) ?? ensureLatestSession();

    const cfg = loadFullConfig();
    const qwenCfg = {
      baseUrl: cfg.baseUrl,
      apiKey,
      multimodalModel: cfg.multimodalModel,
      imageModel: cfg.imageModel,
    };

    /* 2. 多模态润色(模型自行判断意图:生图 / 仅建议) */
    const rawOutput = await multimodalRefine(
      qwenCfg,
      cfg.systemPrompt,
      buildHistory(session),
      userText || '生成类似款式的鞋子',
      imageBase64,
    );

    /* 3. 解析模式标记(容忍全/半角冒号、空格、中英文、前置空白) */
    const MODE_RE = /【\s*模式\s*[：:]\s*(生成|对话|建议|generate|advice|chat)\s*】/i;
    const trimmed = rawOutput.trim();
    const modeMatch = trimmed.match(MODE_RE);
    let mode: 'generate' | 'advice';
    const m = modeMatch?.[1].toLowerCase();
    if (m === '生成' || m === 'generate') mode = 'generate';
    else mode = 'advice'; // 对话/建议/chat/无标记 → 一律对话(保守,避免误生图)
    // 无标记但确含 Prompt 的极少数情况,仍判生成
    if (!modeMatch && /【\s*Prompt\s*】/i.test(trimmed)) mode = 'generate';

    const stripped = trimmed.replace(MODE_RE, '').trim();
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'user',
      content: userText || '生成类似款式的鞋子',
      attachedImages: imageBase64 ? [imageBase64] : undefined,
      timestamp: now,
    };

    /* 4a. 建议模式:仅返回文本,跳过生图(省成本) */
    if (mode === 'advice') {
      const advice = stripped || '(暂无建议)';
      const aiMsg: ChatMessage = {
        id: nextMsgId(),
        role: 'assistant',
        content: advice,
        timestamp: Date.now(),
      };
      appendMessages(session, userMsg, aiMsg);
      const data: ChatGenerateResponse = {
        sessionId: session.id,
        mode: 'advice',
        content: advice,
        images: [],
        count: 0,
      };
      res.json({ success: true, data } satisfies ApiEnvelope<ChatGenerateResponse>);
      return;
    }

    /* 4b. 生成模式:提取 Prompt 前的全部说明(理由+设计说明)完整展示 */
    const promptMatch = stripped.match(/【\s*Prompt\s*】([\s\S]*)/i);
    const refinedPrompt = promptMatch ? promptMatch[1].trim() : stripped;

    // 展示文本 = Prompt 之前的所有内容,清理标签与多余空行
    let explanation = promptMatch
      ? stripped.slice(0, stripped.search(/【\s*Prompt\s*】/i))
      : '';
    explanation = explanation
      .replace(/【\s*(理由|设计说明)\s*】/gi, '')
      .replace(/^\s*[\r\n]+/gm, '\n')
      .trim();

    /* 5. 生图(文生图 / 图生图) */
    const imageUrls = await generateImages(qwenCfg, {
      prompt: refinedPrompt,
      refImageBase64: imageBase64,
      n: imageCount ?? 1,
    });

    /* 6. 下载落盘 → 文件名 */
    const filenames: string[] = [];
    for (const url of imageUrls) {
      try {
        filenames.push(await storage.downloadImage(url));
      } catch (err) {
        console.error('[chat] 下载图片失败:', url, err);
      }
    }

    /* 7. 组装回复并持久化(展示完整理由+设计说明) */
    const content = explanation
      ? `${explanation}\n\n---\n已生成 ${filenames.length} 张图片`
      : `已生成 ${filenames.length} 张图片`;
    const aiMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'assistant',
      content,
      generatedImages: filenames,
      timestamp: Date.now(),
    };
    appendMessages(session, userMsg, aiMsg);

    /* 8. 响应 */
    const data: ChatGenerateResponse = {
      sessionId: session.id,
      mode: 'generate',
      content,
      images: filenames,
      count: filenames.length,
    };
    res.json({ success: true, data } satisfies ApiEnvelope<ChatGenerateResponse>);
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   跨消息持久 SSE 通道
   - GET  /connect:建立长连接(EventSource),按 clientId 注册
   - POST /send   :发送消息,异步跑智能体循环,事件经通道推送
   事件:connected / meta / text / image_start / image_ready / image_error / done / error
   ═══════════════════════════════════════════ */
chatRouter.get('/connect', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId =
    (req.query.clientId as string) ||
    `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const conn: SseConnection = {
    clientId,
    res,
    closed: false,
    heartbeat: setInterval(() => sendComment(conn, `keep-alive ${Date.now()}`), 15000),
  };

  res.on('close', () => {
    conn.closed = true;
    // 仅当注册表里仍是本连接时才注销(防止旧连接 close 误删新连接)
    unregister(clientId, conn);
    logger.debug('chat', `通道关闭 ${clientId}`);
  });

  register(conn);
  logger.info('chat', `GET /connect ${clientId}`);

  // 立即回送 connected,前端据此确认通道就绪
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);
});

chatRouter.post('/send', async (req, res) => {
  const { clientId, sessionId, userText, imageBase64 } = req.body as ChatSendBody;
  const turnId =
    (req.body.turnId as string) || `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const conn = clientId ? getConn(clientId) : undefined;
  if (!conn || conn.closed) {
    res.status(400).json({ success: false, error: 'SSE 通道未连接' });
    return;
  }
  conn.turnId = turnId;

  logger.info('chat', 'POST /send', {
    clientId,
    sessionId: sessionId ?? '(none)',
    userText: logger.pv(userText, 60),
    hasImage: !!imageBase64,
    turnId,
  });

  // 立即 ACK,后续事件异步经通道推送
  res.json({ success: true, data: { turnId } });

  const emit = (event: string, data: unknown) =>
    emitEvent(conn, event, data as Record<string, unknown>);

  if (!userText && !imageBase64) {
    emit('error', { message: '消息不能为空' });
    return;
  }

  const apiKey = getActiveApiKey();
  if (!apiKey) {
    emit('error', { message: '请先在设置中配置 API Key' });
    return;
  }

  // 异步执行,不阻塞响应
  void (async () => {
    try {
      const session =
        (sessionId ? getSession(sessionId) : null) ?? ensureLatestSession();
      emit('meta', { sessionId: session.id });

      const cfg = loadFullConfig();
      const qwenCfg = {
        baseUrl: cfg.baseUrl,
        apiKey,
        multimodalModel: cfg.multimodalModel,
        imageModel: cfg.imageModel,
      };

      const result = await runAgent({
        qwenCfg,
        systemPrompt: cfg.systemPrompt,
        history: buildHistory(session),
        userText: userText || '生成类似款式的鞋子',
        imageBase64,
        emit,
        shouldStop: () => conn.closed,
      });

      const now = Date.now();
      const userMsg: ChatMessage = {
        id: nextMsgId(),
        role: 'user',
        content: userText || '生成类似款式的鞋子',
        attachedImages: imageBase64 ? [imageBase64] : undefined,
        timestamp: now,
      };
      const aiMsg: ChatMessage = {
        id: nextMsgId(),
        role: 'assistant',
        content: result.content,
        generatedImages: result.images,
        timestamp: Date.now(),
      };
      appendMessages(session, userMsg, aiMsg);
      logger.info('chat', `已持久化到会话 ${session.id}`, { images: result.images.length });

      emit('done', {
        sessionId: session.id,
        content: result.content,
        images: result.images,
        count: result.images.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('chat', '/send 异步异常', msg);
      emit('error', { message: msg });
    }
  })();
});
