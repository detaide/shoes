import { http } from '@/lib/http';
import type { Session, SessionCreateResponse, SessionSummary } from '@shared/types';

/* 会话上下文 — 多会话管理 */

export function listSessions() {
  return http.get<SessionSummary[]>('/sessions');
}

/** 最新会话(连接默认上下文);后端无会话时自动创建 */
export function getLatestSession() {
  return http.get<Session>('/sessions/latest');
}

export function createSession(title?: string) {
  return http.post<SessionCreateResponse>('/sessions', title ? { title } : undefined);
}

export function getSession(id: string) {
  return http.get<Session>(`/sessions/${encodeURIComponent(id)}`);
}

export function deleteSession(id: string) {
  return http.del<{ deleted: boolean }>(`/sessions/${encodeURIComponent(id)}`);
}
