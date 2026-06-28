/* ═══════════════════════════════════════════
   会话服务 — session 上下文持久化
   每个 session 一个 JSON 文件于 data/sessions/
   - list():摘要列表(按 updatedAt 倒序)
   - latest():最新会话(连接默认使用)
   - ensureLatest():无会话则创建一个
   ═══════════════════════════════════════════ */

import path from 'node:path';
import fs from 'node:fs';
import type { Session, SessionSummary } from '@shared/types';
import type { ChatMessage } from '@shared/types';
import { storage } from './storage.service';
import { logger } from '../utils/logger';

function newId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sessionFile(id: string): string {
  return path.join(storage.sessionsDir, `${id}.json`);
}

function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t ? (t.length > 20 ? t.slice(0, 20) + '…' : t) : '新对话';
}

export function listSessions(): SessionSummary[] {
  if (!fs.existsSync(storage.sessionsDir)) return [];
  return fs
    .readdirSync(storage.sessionsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => storage.readJSON<Session>(path.join(storage.sessionsDir, f), null as any))
    .filter((s): s is Session => !!s && !!s.id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      messageCount: s.messages?.length ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | null {
  const s = storage.readJSON<Session | null>(sessionFile(id), null);
  return s && s.id ? s : null;
}

export function createSession(title = '新对话'): Session {
  const now = Date.now();
  const session: Session = {
    id: newId(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  saveSession(session);
  logger.info('session', `创建会话 ${session.id}`, { title });
  return session;
}

export function saveSession(session: Session): void {
  session.updatedAt = Date.now();
  storage.writeJSON(sessionFile(session.id), session);
}

export function deleteSession(id: string): boolean {
  const file = sessionFile(id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    logger.info('session', `删除会话 ${id}`);
    return true;
  }
  logger.warn('session', `删除会话不存在 ${id}`);
  return false;
}

/** 最新会话(连接默认上下文);无则返回 null */
export function getLatestSession(): Session | null {
  const list = listSessions();
  if (list.length === 0) return null;
  return getSession(list[0].id);
}

/** 无会话时创建并返回,否则返回最新 */
export function ensureLatestSession(): Session {
  return getLatestSession() ?? createSession();
}

/** 追加消息并自动维护标题(首条用户消息) */
export function appendMessages(
  session: Session,
  ...msgs: ChatMessage[]
): Session {
  session.messages.push(...msgs);
  const firstUser = session.messages.find((m) => m.role === 'user');
  if (firstUser && (session.title === '新对话' || !session.title)) {
    session.title = deriveTitle(firstUser.content);
  }
  saveSession(session);
  logger.info('session', `追加 ${msgs.length} 条消息到 ${session.id}`, {
    total: session.messages.length,
    title: session.title,
  });
  return session;
}
