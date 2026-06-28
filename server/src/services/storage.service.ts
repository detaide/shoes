/* ═══════════════════════════════════════════
   磁盘存储服务 — 替代 Electron app.getPath/fs
   - 图片下载/读取/删除/列表
   - 路径穿越防护(严格限定在 imagesDir 内)
   ═══════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config';
import { logger } from '../utils/logger';

class StorageService {
  readonly dataDir = env.dataDir;
  get imagesDir() {
    return path.join(this.dataDir, 'images');
  }
  get sessionsDir() {
    return path.join(this.dataDir, 'sessions');
  }

  ensureDirs() {
    for (const d of [this.dataDir, this.imagesDir, this.sessionsDir]) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
  }

  /** 生成随机文件名(防用户原始名注入) */
  randomFilename(ext = '.png'): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
  }

  /** 下载远程图片到本地,返回文件名 */
  async downloadImage(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`图片下载失败: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const filename = this.randomFilename('.png');
    fs.writeFileSync(path.join(this.imagesDir, filename), buffer);
    logger.info('storage', `下载图片 ${filename}`, { bytes: buffer.length, from: logger.pv(url, 60) });
    return filename;
  }

  /** 安全解析图片路径(防穿越) */
  resolveImage(filename: string): string {
    const safe = path.resolve(this.imagesDir, filename);
    if (!safe.startsWith(this.imagesDir + path.sep) && safe !== this.imagesDir) {
      throw new Error('路径非法');
    }
    return safe;
  }

  /** 列出图片 */
  listImages(): { name: string; mtime: number }[] {
    if (!fs.existsSync(this.imagesDir)) return [];
    return fs
      .readdirSync(this.imagesDir)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((name) => ({
        name,
        mtime: fs.statSync(path.join(this.imagesDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  deleteImage(filename: string): boolean {
    const p = this.resolveImage(filename);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      logger.info('storage', `删除图片 ${filename}`);
      return true;
    }
    logger.warn('storage', `删除图片不存在 ${filename}`);
    return false;
  }

  /** 读取图片为 dataURL(供图生图:基于历史图做调整) */
  readImageBase64(filename: string): string {
    const p = this.resolveImage(filename);
    if (!fs.existsSync(p)) throw new Error('参考图不存在');
    const buf = fs.readFileSync(p);
    const ext = (path.extname(filename).slice(1) || 'png').toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    logger.debug('storage', `读取参考图 ${filename} → dataURL`, { bytes: buf.length });
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  }

  /* ── JSON 读写工具(config/sessions 复用) ── */
  readJSON<T>(file: string, fallback: T): T {
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
      return fallback;
    }
  }

  writeJSON(file: string, data: unknown): void {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  }
}

export const storage = new StorageService();
