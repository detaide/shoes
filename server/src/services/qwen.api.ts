/* ═══════════════════════════════════════════
   千问 API 封装 — 从 main/services/api/qwen.api.ts 迁移
   增强:多模态润色支持多轮上下文(session history)
   ═══════════════════════════════════════════ */

import { logger } from '../utils/logger';

export interface QwenConfig {
  baseUrl: string;
  apiKey: string;
  multimodalModel: string;
  imageModel: string;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

type UserContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: UserContent;
}

/* ── 多模态润色(支持多轮上下文) ── */
export async function multimodalRefine(
  config: QwenConfig,
  systemPrompt: string,
  history: HistoryTurn[],
  userText: string,
  imageBase64?: string,
): Promise<string> {
  logger.info('qwen', 'multimodalRefine 请求', {
    model: config.multimodalModel,
    history: history.length,
    hasImage: !!imageBase64,
    userText: logger.pv(userText, 60),
  });
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  const userContent: ChatMessage['content'] = [];
  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageBase64 },
    });
  }
  userContent.push({ type: 'text', text: userText });
  messages.push({ role: 'user', content: userContent });

  const url = `${config.baseUrl}/compatible-mode/v1/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.multimodalModel,
      messages,
      // 低温度:让意图判断与输出格式更稳定、可解析
      temperature: 0.3,
      top_p: 0.8,
      enable_thinking: false,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    logger.error('qwen', `multimodalRefine 失败 ${resp.status}`, logger.pv(err, 200));
    throw new Error(`千问多模态 API 错误 (${resp.status}): ${err}`);
  }

  const data = (await resp.json()) as any;
  const content = data.choices?.[0]?.message?.content ?? '';
  logger.info('qwen', 'multimodalRefine 返回', { len: content.length, preview: logger.pv(content, 120) });
  return content;
}

/* ── 生图(文生图/图生图,统一端点) ── */
interface ImageGenInput {
  prompt: string;
  refImageBase64?: string;
  n?: number;
  size?: string;
}

export async function generateImages(
  config: QwenConfig,
  input: ImageGenInput,
): Promise<string[]> {
  logger.info('qwen', 'generateImages 请求', {
    model: config.imageModel,
    n: input.n ?? 1,
    hasRef: !!input.refImageBase64,
    prompt: logger.pv(input.prompt, 100),
  });
  const content: Array<{ image?: string; text?: string }> = [];
  if (input.refImageBase64) content.push({ image: input.refImageBase64 });
  content.push({ text: input.prompt });

  const url = `${config.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.imageModel,
      input: { messages: [{ role: 'user', content }] },
      parameters: {
        n: input.n ?? 1,
        size: input.size ?? '1024*1024',
        prompt_extend: true,
        watermark: false,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    logger.error('qwen', `generateImages 失败 ${resp.status}`, logger.pv(err, 200));
    throw new Error(`千问生图 API 错误 (${resp.status}): ${err}`);
  }

  const data = (await resp.json()) as any;

  // qwen-image / wan 系列均通过本同步端点返回,结构一致:
  // output.choices[0].message.content[].image
  const images: string[] = [];
  const contents = data.output?.choices?.[0]?.message?.content ?? [];
  for (const item of contents) {
    if (item.image) images.push(item.image);
  }

  if (images.length === 0) {
    logger.error('qwen', 'generateImages 未返回图片,原始响应', logger.pv(JSON.stringify(data), 400));
    throw new Error(`生图未返回任何图片(模型:${config.imageModel});请查看后端日志原始响应以排查`);
  }

  logger.info('qwen', `generateImages 返回 ${images.length} 张`, images.map((u) => logger.pv(u, 50)));
  return images;
}

/* ═══════════════════════════════════════════
   智能体决策调用(function calling)
   模型用 generate_image / finish 工具自决生图
   ═══════════════════════════════════════════ */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
}

export interface AgentDecision {
  message: AgentMessage;
  text: string;
  toolCalls: ToolCall[];
}

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export interface AgentCallOpts {
  signal?: AbortSignal;
  /** 文本增量回调(逐 token) */
  onText?: (delta: string) => void;
}

export async function agentCall(
  config: QwenConfig,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  opts: AgentCallOpts = {},
): Promise<AgentDecision> {
  const url = `${config.baseUrl}/compatible-mode/v1/chat/completions`;
  logger.info('qwen', 'agentCall 请求', {
    model: config.multimodalModel,
    messages: messages.length,
    tools: tools.map((t) => t.function.name),
    stream: true,
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.multimodalModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      top_p: 0.8,
      stream: true,
      enable_thinking: false,
    }),
    signal: opts.signal,
  });

  if (!resp.ok) {
    const err = await resp.text();
    logger.error('qwen', `agentCall 失败 ${resp.status}`, logger.pv(err, 200));
    throw new Error(`千问决策 API 错误 (${resp.status}): ${err}`);
  }
  if (!resp.body) throw new Error('千问决策 API 无响应体');
  logger.debug('qwen', 'agentCall 流式响应已建立,开始读取');

  /* 逐 chunk 解析 SSE,累计文本与 tool_calls 增量 */
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let textAcc = '';
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  const mergeDelta = (chunk: any) => {
    const delta = chunk?.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === 'string' && delta.content) {
      textAcc += delta.content;
      opts.onText?.(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments;
        toolAcc.set(idx, cur);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        mergeDelta(JSON.parse(payload));
      } catch {
        /* 忽略半行 JSON */
      }
    }
  }

  /* 组装最终助手消息(可回喂下一轮)+ 解析工具调用 */
  const toolCallsFinal = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2, 8)}`,
      type: 'function',
      function: { name: tc.name, arguments: tc.args || '{}' },
    }));

  const message: AgentMessage = {
    role: 'assistant',
    content: textAcc || null,
    tool_calls: toolCallsFinal.length ? toolCallsFinal : undefined,
  };

  const toolCalls: ToolCall[] = toolCallsFinal
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: safeParseArgs(tc.function.arguments),
    }))
    .filter((tc: ToolCall) => tc.name);

  logger.info('qwen', 'agentCall 完成', {
    textLen: textAcc.length,
    toolCalls: toolCalls.map((t) => ({ name: t.name, args: logger.pv(t.args, 100) })),
  });

  return { message, text: textAcc, toolCalls };
}
