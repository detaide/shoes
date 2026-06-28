/* ═══════════════════════════════════════════
   SSE 持久通道事件类型 — GET /connect + POST /send
   每个事件(data)均带 turnId,前端按当前轮次过滤
   ═══════════════════════════════════════════ */

export interface SseConnected {
  clientId: string;
}

export interface SseMeta {
  sessionId?: string;
  round?: number;
  turnId?: string;
}

export interface SseText {
  delta?: string;
  text?: string;
  turnId?: string;
}

export interface SseImageStart {
  slot: string;
  round: number;
  count?: number;
  turnId?: string;
}

export interface SseImageReady {
  slot: string;
  name: string;
  turnId?: string;
}

export interface SseImageError {
  slot: string;
  error: string;
  turnId?: string;
}

export interface SseDone {
  sessionId: string;
  content: string;
  images: string[];
  count: number;
  turnId?: string;
}

export interface SseError {
  message: string;
  turnId?: string;
}
