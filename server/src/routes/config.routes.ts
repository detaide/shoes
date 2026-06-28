import { Router } from 'express';
import type { ApiEnvelope, AppConfig, AppConfigPatch } from '@shared/types';
import {
  loadConfig,
  updateConfig,
  resetConfig,
} from '../services/config.service';
import { logger } from '../utils/logger';

export const configRouter = Router();

function ok<T>(data: T, res: any) {
  const body: ApiEnvelope<T> = { success: true, data };
  res.json(body);
}

configRouter.get('/', (_req, res) => {
  const cfg = loadConfig();
  logger.info('config', `GET /config hasApiKey=${cfg.hasApiKey}`);
  ok<AppConfig>(cfg, res);
});

configRouter.patch('/', (req, res) => {
  ok<AppConfig>(updateConfig(req.body as AppConfigPatch), res);
});

configRouter.post('/reset', (_req, res) => {
  ok<AppConfig>(resetConfig(), res);
});
