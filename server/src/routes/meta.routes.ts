import { Router } from 'express';

export const metaRouter = Router();

metaRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      version: '1.0.0',
      platform: '阿里云 DashScope(千问)',
      serverTime: Date.now(),
    },
  });
});
