import type { ErrorRequestHandler } from 'express';
import type { ApiEnvelope } from '@shared/types';
import { logger } from '../utils/logger';

/* 统一错误处理 — 失败响应保持 bridge 信封结构 */
export const errorHandler: ErrorRequestHandler = (err, req, _res, _next) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('error', `${req.method} ${req.url} → ${message}`);
  const body: ApiEnvelope = { success: false, error: message };
  _res.status(500).json(body);
};
