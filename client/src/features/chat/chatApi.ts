import { http } from '@/lib/http';
import { openChannel, SSE_BASE, type ChannelHandlers } from '@/lib/sse';
import type {
  ChatGenerateRequest,
  ChatGenerateResponse,
  ChatMessage,
} from '@shared/types';

/* 旧:单次生图(保留兼容) */
export function generateImage(params: ChatGenerateRequest) {
  return http.post<ChatGenerateResponse>('/chat/generate', params);
}

/** 持久通道:打开 EventSource 长连接 */
export function openChatChannel(clientId: string, handlers: ChannelHandlers) {
  return openChannel(clientId, handlers);
}

/** 发送消息(事件经持久通道推送,POST 仅做 ACK) */
export interface SendBody {
  clientId: string;
  turnId: string;
  sessionId?: string;
  userText?: string;
  imageBase64?: string;
}

export function sendMessage(body: SendBody) {
  return http.post<{ turnId: string }>('/chat/send', body);
}

export { SSE_BASE };
export type { ChatMessage };
