/* ═══════════════════════════════════════════
   GalleryPage — 图库页
   改造点:file:// → toImageUrl;复用共享 ImageModal
   ═══════════════════════════════════════════ */

import { useState } from 'react';
import Icon from '@/components/common/Icon';
import ImageModal from '@/components/common/ImageModal';
import { toImageUrl } from '@/lib/imageUrl';
import { useGallery } from '@/features/gallery/useGallery';
import './GalleryPage.css';

export default function GalleryPage() {
  const { images, loading, remove } = useGallery();
  const [preview, setPreview] = useState<string | null>(null);

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除「${name}」?`)) return;
    try {
      await remove(name);
      if (preview === name) setPreview(null);
    } catch (err) {
      console.error('[Gallery] 删除失败', err);
    }
  };

  return (
    <div className="gallery-page">
      <header className="gallery-header">
        <Icon name="gallery" size={18} filled />
        <span>图库</span>
        <span className="gallery-count">{images.length} 张</span>
      </header>

      {loading ? (
        <div className="gallery-empty">
          <p>加载中…</p>
        </div>
      ) : images.length === 0 ? (
        <div className="gallery-empty">
          <Icon name="image" size={48} />
          <p>暂无生成图像</p>
          <span>去「对话」页面生图后将出现在这里</span>
        </div>
      ) : (
        <div className="gallery-grid">
          {images.map((img) => (
            <div className="gallery-item" key={img.name}>
              <img
                src={toImageUrl(img.name)}
                alt={img.name}
                loading="lazy"
                onClick={() => setPreview(img.name)}
              />
              <button
                className="gallery-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(img.name);
                }}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <ImageModal
          src={preview}
          alt={preview}
          caption={preview}
          onClose={() => setPreview(null)}
          onDelete={() => handleDelete(preview)}
        />
      )}
    </div>
  );
}
