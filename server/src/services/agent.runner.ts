/* ═══════════════════════════════════════════
   Agent Loop Runner — 模型驱动的多轮智能体循环
   - 每轮:调模型(tools) → 解析 tool_calls → 执行 → 回喂
   - generate_image 触发生图;based_on_last 基于上张图调整(图生图)
   - finish / 无工具调用 → 终止;MAX_ROUNDS/MAX_IMAGES 硬上限
   - 通过 emit 回调向 SSE 通道推送事件
   ═══════════════════════════════════════════ */

import {
  agentCall,
  generateImages,
  type AgentMessage,
  type ToolDefinition,
} from './qwen.api';
import { storage } from './storage.service';
import { logger } from '../utils/logger';

const MAX_ROUNDS = 5;
const MAX_IMAGES = 6;

interface QwenCfg {
  baseUrl: string;
  apiKey: string;
  multimodalModel: string;
  imageModel: string;
}

export type AgentEmit = (event: string, data: unknown) => void;

export interface RunAgentOptions {
  qwenCfg: QwenCfg;
  systemPrompt: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  userText: string;
  imageBase64?: string;
  emit: AgentEmit;
  /** 外部中断检测(如客户端断开) */
  shouldStop?: () => boolean;
  signal?: AbortSignal;
}

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description:
        '生成或调整一张鞋类商品图。仅当确实需要产出或修改图片时调用。prompt 用中文,含产品类型/颜色/材质/视角/纯白背景/柔光箱照明/高清。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '已含调整意图的中文生图 prompt' },
          count: { type: 'number', description: '张数,默认 1' },
          based_on_last: {
            type: 'boolean',
            description: 'true=基于上一张生成图做图生图调整(换色/换材质/换角度)',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '不再生成更多图片,结束本轮(也可直接用文字收尾而不调用任何工具)。',
      parameters: { type: 'object', properties: {} },
    },
  },
];

export async function runAgent(opts: RunAgentOptions): Promise<{
  content: string;
  images: string[];
}> {
  const { qwenCfg, systemPrompt, history, userText, imageBase64, emit, shouldStop, signal } = opts;
  logger.info('agent', '开始循环', {
    history: history.length,
    userText: logger.pv(userText, 60),
    hasImage: !!imageBase64,
    maxRounds: MAX_ROUNDS,
    maxImages: MAX_IMAGES,
  });

  /* 构造初始消息:系统 + 历史 + 当前用户(可带图) */
  const messages: AgentMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const t of history) messages.push({ role: t.role, content: t.content });
  if (imageBase64) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64 } },
        { type: 'text', text: userText },
      ],
    });
  } else {
    messages.push({ role: 'user', content: userText });
  }

  let aggregatedText = '';
  const images: string[] = [];
  let stopReason = 'completed';

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (shouldStop?.()) {
      stopReason = 'aborted(client)';
      logger.warn('agent', `轮 ${round}:客户端已断开,终止`);
      break;
    }
    emit('meta', { round });
    logger.info('agent', `── 轮 ${round} 开始 ──`);

    let roundText = '';
    const decision = await agentCall(qwenCfg, messages, TOOLS, {
      signal,
      onText: (delta) => {
        roundText += delta;
        emit('text', { delta });
      },
    });
    messages.push(decision.message); // 回喂助手轮(含 tool_calls)

    logger.info('agent', `轮 ${round}:模型回复`, {
      textLen: roundText.length,
      text: logger.pv(roundText, 120),
      toolCalls: decision.toolCalls.map((t) => t.name),
    });

    if (roundText) {
      aggregatedText += (aggregatedText ? '\n\n' : '') + roundText;
    }

    const calls = decision.toolCalls;
    if (calls.length === 0) {
      stopReason = 'no-tool';
      logger.info('agent', `轮 ${round}:无工具调用,结束`);
      break;
    }

    /* function calling 下模型常只返回 tool_calls 而 content 为空,
       此处合成反馈文本,保证前端始终有文字回显 */
    if (!roundText) {
      const syn = '🎨 正在为你生成图片…';
      emit('text', { delta: syn });
      aggregatedText += (aggregatedText ? '\n\n' : '') + syn;
      logger.info('agent', `轮 ${round}:模型未回文字,合成反馈`);
    }

    let wantFinish = false;

    for (const tc of calls) {
      if (tc.name === 'finish') {
        wantFinish = true;
        logger.info('agent', `轮 ${round}:模型调用 finish`);
        continue;
      }
      if (tc.name !== 'generate_image') continue;

      // 预算护栏
      if (images.length >= MAX_IMAGES) {
        stopReason = 'image-cap';
        logger.warn('agent', `轮 ${round}:已达最大图片数 ${MAX_IMAGES},跳过`);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: '已达本回合最大图片数,停止生成。',
        });
        continue;
      }

      const prompt = String(tc.args.prompt ?? '');
      const count = Math.max(1, Math.min(4, Number(tc.args.count ?? 1)));
      const basedOnLast = Boolean(tc.args.based_on_last);
      logger.info('agent', `轮 ${round}:生图请求`, {
        count,
        basedOnLast,
        prompt: logger.pv(prompt, 120),
      });

      // 生图时输出所用提示词(对用户可见,并计入最终内容)
      if (prompt) {
        const promptLine = `\n🎨 生图提示词:${prompt}\n`;
        emit('text', { delta: promptLine });
        aggregatedText += promptLine;
        logger.info('agent', `轮 ${round}:已输出提示词`);
      }

      // 占位事件(按请求数)
      const slots = Array.from({ length: count }, (_, i) => `${tc.id}_${i}`);
      for (const s of slots) emit('image_start', { slot: s, round });

      // 参考图:基于上张 OR 首轮用户上传
      let refImage: string | undefined;
      try {
        if (basedOnLast && images.length > 0) {
          refImage = storage.readImageBase64(images[images.length - 1]);
          logger.debug('agent', `轮 ${round}:使用上张图作参考`, images[images.length - 1]);
        } else if (imageBase64 && round === 1) {
          refImage = imageBase64;
          logger.debug('agent', `轮 ${round}:使用用户上传图作参考`);
        }
      } catch (err) {
        logger.warn('agent', `轮 ${round}:读取参考图失败`, err instanceof Error ? err.message : err);
        refImage = undefined;
      }

      // 生图
      let urls: string[] = [];
      try {
        urls = await generateImages(qwenCfg, {
          prompt,
          refImageBase64: refImage,
          n: count,
        });
        logger.info('agent', `轮 ${round}:生图返回 ${urls.length} 张`, urls.map((u) => logger.pv(u, 50)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('agent', `轮 ${round}:生图失败`, msg);
        for (const s of slots) emit('image_error', { slot: s, error: msg });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `生图失败: ${msg}` });
        continue;
      }

      // 逐张下载,按 slot 回填
      const got: string[] = [];
      for (let i = 0; i < slots.length; i++) {
        if (shouldStop?.()) break;
        if (i >= urls.length) {
          emit('image_error', { slot: slots[i], error: '未生成' });
          logger.warn('agent', `轮 ${round}:slot ${slots[i]} 未生成`);
          continue;
        }
        try {
          const fn = await storage.downloadImage(urls[i]);
          if (images.length >= MAX_IMAGES) {
            emit('image_error', { slot: slots[i], error: '已达上限' });
            logger.warn('agent', `轮 ${round}:slot ${slots[i]} 达上限,丢弃`);
            break;
          }
          images.push(fn);
          got.push(fn);
          emit('image_ready', { slot: slots[i], name: fn });
          logger.info('agent', `轮 ${round}:图片就绪 slot=${slots[i]}`, fn);
        } catch (err) {
          emit('image_error', { slot: slots[i], error: '下载失败' });
          logger.error('agent', `轮 ${round}:下载失败 slot=${slots[i]}`, err instanceof Error ? err.message : err);
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: `已生成 ${got.length} 张:${got.join(',')}。当前累计 ${images.length} 张。`,
      });
    }

    if (wantFinish) {
      stopReason = 'finish';
      logger.info('agent', `轮 ${round}:模型结束`);
      break;
    }
  }

  if (stopReason === 'completed') {
    logger.warn('agent', `达到最大轮数 ${MAX_ROUNDS},强制结束`);
  }

  /* 生成过图片时,确保最终内容带摘要(避免空回复) */
  let finalContent = aggregatedText;
  if (images.length > 0) {
    const summary = `✅ 已生成 ${images.length} 张图片`;
    finalContent = finalContent ? `${finalContent}\n\n${summary}` : summary;
  }

  logger.info('agent', '循环结束', {
    reason: stopReason,
    images: images.length,
    contentLen: finalContent.length,
  });

  return { content: finalContent || '(已处理)', images };
}
