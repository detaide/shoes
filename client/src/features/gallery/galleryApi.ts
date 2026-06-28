import { http } from '@/lib/http';

export interface ImageEntry {
  name: string;
  mtime: number;
}

/* 替代原 bridge.image 命名空间 */

export function listImages() {
  return http.get<ImageEntry[]>('/images');
}

export function deleteImage(name: string) {
  return http.del<{ deleted: boolean }>(`/images/${encodeURIComponent(name)}`);
}
