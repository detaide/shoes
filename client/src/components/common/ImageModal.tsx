/* ═══════════════════════════════════════════
   ImageModal — 统一图片预览弹窗
   合并原 ChatBubble / GalleryPage 两处重复实现
   能力:大图预览 / 右键菜单(复制/下载)/ 可选删除
   ═══════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { toImageUrl, downloadImage } from '@/lib/imageUrl';
import { copyImageToClipboard } from '@/lib/clipboard';
import './ImageModal.css';

interface ImageModalProps {
  /** 图片源:文件名或完整 URL(dataURL/http/file) */
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
  /** 提供时显示删除按钮 */
  onDelete?: () => void;
  /** 提供时显示「用作参考图」按钮(把图片转入输入框) */
  onUseAsReference?: () => void;
}

export default function ImageModal({
  src,
  alt = '预览',
  caption,
  onClose,
  onDelete,
  onUseAsReference,
}: ImageModalProps) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  const close = useCallback(() => {
    onClose();
    setCtx(null);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await copyImageToClipboard(toImageUrl(src));
    } catch (err) {
      alert(err instanceof Error ? err.message : '复制失败');
    }
    setCtx(null);
  }, [src]);

  const handleDownload = useCallback(() => {
    downloadImage(src);
    setCtx(null);
  }, [src]);

  /* ESC 关闭 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="img-modal-overlay"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div className="img-modal-box" onClick={(e) => e.stopPropagation()}>
        <img
          src={toImageUrl(src)}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCtx({ x: e.clientX, y: e.clientY });
          }}
        />

        {(caption || onDelete || onUseAsReference) && (
          <div className="img-modal-info">
            {caption && <span className="img-modal-caption">{caption}</span>}
            <div className="img-modal-actions">
              {onUseAsReference && (
                <button
                  className="img-modal-btn primary"
                  onClick={() => {
                    onUseAsReference();
                    close();
                  }}
                >
                  用作参考图
                </button>
              )}
              <button className="img-modal-btn save" onClick={handleDownload}>
                保存
              </button>
              {onDelete && (
                <button
                  className="img-modal-btn danger"
                  onClick={() => {
                    onDelete();
                    close();
                  }}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        className="img-modal-close"
        onClick={close}
        aria-label="关闭"
      >
        ×
      </button>

      {ctx && (
        <div
          className="ctx-menu"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleCopy}>复制图片</button>
          <button onClick={handleDownload}>保存图片</button>
        </div>
      )}
    </div>
  );
}
