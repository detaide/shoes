/* ═══════════════════════════════════════════
   会话(Session)类型 — 前后端共享
   一个 session = 一段独立的多轮对话上下文
   ═══════════════════════════════════════════ */

import type { ChatMessage } from './chat';

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 列表摘要(不含完整消息体,减小传输) */
export interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

/** 创建会话响应 */
export interface SessionCreateResponse {
  id: string;
  title: string;
  createdAt: number;
}

export interface ChatGenerateRequest {
  /** 目标会话;不传则使用/创建最新会话 */
  sessionId?: string;
  userText: string;
  imageBase64?: string;
  imageCount?: number;
}

export interface ChatGenerateResponse {
  sessionId: string;
  /** 本轮意图:生图 / 仅建议 */
  mode: 'generate' | 'advice';
  /** 直接可显示的回复文本(建议全文 或 设计说明) */
  content: string;
  /** 生成的图片文件名列表(仅 generate 模式) */
  images: string[];
  count: number;
}
