/* ═══════════════════════════════════════════
   useGallery — 图库数据逻辑(从 GalleryPage 抽取)
   ═══════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { listImages, deleteImage, type ImageEntry } from './galleryApi';

export function useGallery() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setImages(await listImages());
    } catch (err) {
      console.error('[Gallery] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = useCallback(async (name: string) => {
    await deleteImage(name);
    setImages((prev) => prev.filter((i) => i.name !== name));
  }, []);

  return { images, loading, reload, remove };
}
