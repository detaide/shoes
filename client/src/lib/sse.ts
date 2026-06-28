/* ═══════════════════════════════════════════
   SSE 持久通道 — 跨消息长连接(EventSource)
   - openChannel:GET /connect 建立长连接,监听命名事件
   - 发消息走独立 POST(/api/chat/send),事件经通道推送
   ═══════════════════════════════════════════ */

import type {
  SseConnected,
  SseDone,
  SseError,
  SseImageError,
  SseImageReady,
  SseImageStart,
  SseMeta,
  SseText,
} from '@shared/types';

/**
 * SSE 通道基址:默认相对当前页面 origin。
 * - dev:页面 origin 即 Vite(5173),由 vite.config 代理 /api → 后端 3001
 * - 生产:同源/反向代理转发 /api
 * - 跨源(前端与后端不同源)时,构建期用 VITE_API_BASE 指定后端绝对地址
 * 注意:不要硬编码 localhost,否则从别的机器访问会指向浏览器本机。
 */
const SSE_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface ChannelHandlers {
  onConnected?(d: SseConnected): void;
  onMeta?(d: SseMeta): void;
  onText?(d: SseText): void;
  onImageStart?(d: SseImageStart): void;
  onImageReady?(d: SseImageReady): void;
  onImageError?(d: SseImageError): void;
  onDone?(d: SseDone): void;
  onError?(d: SseError): void;
}

function parse<T>(data: string | null): T {
  if (!data) return {} as T;
  try {
    return JSON.parse(data) as T;
  } catch {
    return {} as T;
  }
}

/** 打开持久 SSE 通道,返回 EventSource(调用方负责 close) */
export function openChannel(clientId: string, h: ChannelHandlers): EventSource {
  const url = `${SSE_BASE}/api/chat/connect?clientId=${encodeURIComponent(clientId)}`;
  const es = new EventSource(url);

  es.addEventListener('connected', (e) => h.onConnected?.(parse<SseConnected>((e as MessageEvent).data)));
  es.addEventListener('meta', (e) => h.onMeta?.(parse<SseMeta>((e as MessageEvent).data)));
  es.addEventListener('text', (e) => h.onText?.(parse<SseText>((e as MessageEvent).data)));
  es.addEventListener('image_start', (e) => h.onImageStart?.(parse<SseImageStart>((e as MessageEvent).data)));
  es.addEventListener('image_ready', (e) => h.onImageReady?.(parse<SseImageReady>((e as MessageEvent).data)));
  es.addEventListener('image_error', (e) => h.onImageError?.(parse<SseImageError>((e as MessageEvent).data)));
  es.addEventListener('done', (e) => h.onDone?.(parse<SseDone>((e as MessageEvent).data)));
  es.addEventListener('error', (e) => {
    // EventSource 原生 error(连接层);业务错误走 'error' 命名事件
    if ((e as MessageEvent).data) {
      h.onError?.(parse<SseError>((e as MessageEvent).data));
    }
  });

  return es;
}

export { SSE_BASE };
