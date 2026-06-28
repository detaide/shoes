import { Router } from 'express';
import path from 'node:path';
import { storage } from '../services/storage.service';
import { logger } from '../utils/logger';

export const imageRouter = Router();

/* 列表 */
imageRouter.get('/', (_req, res) => {
  const list = storage.listImages();
  logger.info('image', `GET /images → ${list.length} 张`);
  res.json({ success: true, data: list });
});

/* 读取/下载单个 — 替代原 file:// 协议 */
imageRouter.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  try {
    const filePath = storage.resolveImage(filename);
    if (req.query.download === '1') {
      logger.info('image', `下载 ${filename}`);
      res.download(filePath, filename);
      return;
    }
    res.sendFile(filePath);
  } catch {
    logger.warn('image', `图片不存在 ${filename}`);
    res.status(404).json({ success: false, error: '图片不存在' });
  }
});

/* 删除 */
imageRouter.delete('/:filename', (req, res) => {
  const filename = req.params.filename;
  try {
    const deleted = storage.deleteImage(filename);
    logger.info('image', `DELETE ${filename} → ${deleted}`);
    res.json({ success: true, data: { deleted } });
  } catch (err) {
    logger.error('image', `删除失败 ${filename}`, err instanceof Error ? err.message : err);
    res
      .status(400)
      .json({ success: false, error: err instanceof Error ? err.message : '删除失败' });
  }
});
