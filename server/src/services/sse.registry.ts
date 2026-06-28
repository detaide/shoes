/* ═══════════════════════════════════════════
   SSE 连接注册表 — 跨消息持久通道
   - GET /connect 注册一条长连接(按 clientId)
   - POST /send 查表后,把事件写入对应连接的 res
   ═══════════════════════════════════════════ */

import type { Response } from 'express';
import { logger } from '../utils/logger';

export interface SseConnection {
  clientId: string;
  res: Response;
  closed: boolean;
  heartbeat: NodeJS.Timeout;
  /** 当前轮次标识,注入到每个事件,供前端过滤 */
  turnId?: string;
}

const registry = new Map<string, SseConnection>();

export function register(conn: SseConnection): void {
  const old = registry.get(conn.clientId);
  if (old && !old.closed) {
    clearInterval(old.heartbeat);
    try {
      old.res.end();
    } catch {
      /* ignore */
    }
  }
  registry.set(conn.clientId, conn);
  logger.info('sse', `连接注册 ${conn.clientId}(在线 ${registry.size})`);
}

export function getConn(clientId: string): SseConnection | undefined {
  return registry.get(clientId);
}

export function unregister(clientId: string): void {
  const c = registry.get(clientId);
  if (!c) return;
  clearInterval(c.heartbeat);
  registry.delete(clientId);
  logger.info('sse', `连接注销 ${clientId}(在线 ${registry.size})`);
}

/** 推送命名事件(自动注入 turnId);连接已关则丢弃 */
export function emitEvent(conn: SseConnection, event: string, data: Record<string, unknown>): void {
  if (conn.closed) return;
  const payload = { ...data, turnId: conn.turnId };
  conn.res.write(`event: ${event}\n`);
  conn.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  logger.debug('sse', `→ ${conn.clientId} ${event}`, event === 'text' ? undefined : payload);
}

/** 推送注释心跳 */
export function sendComment(conn: SseConnection, text: string): void {
  if (conn.closed) return;
  conn.res.write(`: ${text}\n\n`);
}
