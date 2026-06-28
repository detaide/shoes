import { Router } from 'express';
import type {
  ApiEnvelope,
  Session,
  SessionCreateResponse,
  SessionSummary,
} from '@shared/types';
import {
  listSessions,
  getSession,
  createSession,
  deleteSession,
  ensureLatestSession,
} from '../services/session.service';
import { logger } from '../utils/logger';

export const sessionRouter = Router();

function ok<T>(data: T, res: any) {
  const body: ApiEnvelope<T> = { success: true, data };
  res.json(body);
}

/* 列表(摘要,按 updatedAt 倒序) */
sessionRouter.get('/', (_req, res) => {
  const list = listSessions();
  logger.info('session', `GET /sessions → ${list.length} 个`);
  ok<SessionSummary[]>(list, res);
});

/* 最新会话(连接默认上下文);无则创建一个 */
sessionRouter.get('/latest', (_req, res) => {
  const s = ensureLatestSession();
  logger.info('session', `GET /sessions/latest → ${s.id}`);
  ok<Session>(s, res);
});

/* 创建新会话 */
sessionRouter.post('/', (req, res) => {
  const title = (req.body?.title as string) || '新对话';
  const s = createSession(title);
  ok<SessionCreateResponse>(
    { id: s.id, title: s.title, createdAt: s.createdAt },
    res,
  );
});

/* 获取单个会话(含完整消息) */
sessionRouter.get('/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) {
    logger.warn('session', `GET /sessions/${req.params.id} → 不存在`);
    res.status(404).json({ success: false, error: '会话不存在' });
    return;
  }
  logger.info('session', `GET /sessions/${s.id} → ${s.messages.length} 条消息`);
  ok<Session>(s, res);
});

/* 删除会话 */
sessionRouter.delete('/:id', (req, res) => {
  const deleted = deleteSession(req.params.id);
  ok<{ deleted: boolean }>({ deleted }, res);
});
