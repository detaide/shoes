/* ═══════════════════════════════════════════
   ChatBubble — 聊天气泡
   - 附件图/生成图可「用作参考图」转入输入框
   - 流式期间渲染占位图(pending → ready/error)
   ═══════════════════════════════════════════ */

import { useState } from 'react';
import type { ChatMessage } from '@shared/types';
import { toImageUrl, srcToDataURL } from '@/lib/imageUrl';
import ImageModal from '@/components/common/ImageModal';
import type { StreamImage } from '@/features/chat/useChat';
import './ChatBubble.css';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  attachedImages?: string[];
  generatedImages?: string[];
  timestamp: number;
  /** 流式期间的占位图片项;存在时优先于 generatedImages 渲染 */
  streamImages?: StreamImage[];
  onPickReference?: (dataUrl: string) => void;
}

function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part.split('\n').map((line, j) => (
      <span key={`${i}-${j}`}>
        {j > 0 && <br />}
        {line}
      </span>
    ));
  });
}

export default function ChatBubble({
  role,
  content,
  attachedImages,
  generatedImages,
  timestamp,
  streamImages,
  onPickReference,
}: Props) {
  const isUser = role === 'user';
  const [preview, setPreview] = useState<string | null>(null);
  const timeStr = new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleUseAsReference = async () => {
    if (!preview || !onPickReference) return;
    try {
      onPickReference(await srcToDataURL(preview));
    } catch (err) {
      alert(err instanceof Error ? err.message : '图片转入失败');
    }
  };

  const showThinking = !isUser && streamImages !== undefined && !content && streamImages.length === 0;

  return (
    <div className={`bubble-row${isUser ? ' user' : ''}`}>
      <div className="bubble-avatar">{isUser ? '👤' : '🤖'}</div>

      <div className="bubble-body">
        <div className={`bubble${isUser ? ' user' : ''}`}>
          {attachedImages && attachedImages.length > 0 && (
            <div className="bubble-attached">
              {attachedImages.map((img, i) => (
                <img key={i} src={img} alt={`参考图 ${i + 1}`} />
              ))}
            </div>
          )}

          {showThinking && <p className="bubble-text bubble-thinking">🤔 正在思考…</p>}

          {content && <p className="bubble-text">{renderContent(content)}</p>}

          {/* 流式占位/成图 */}
          {streamImages && streamImages.length > 0 && (
            <div className="bubble-generated">
              {streamImages.map((im) => {
                if (im.status === 'ready' && im.name) {
                  return (
                    <img
                      key={im.slot}
                      src={toImageUrl(im.name)}
                      alt="生成图"
                      onClick={() => setPreview(im.name!)}
                    />
                  );
                }
                return (
                  <div
                    key={im.slot}
                    className={`bubble-img-placeholder${
                      im.status === 'error' ? ' error' : ''
                    }`}
                    title={im.status === 'error' ? im.error : '生成中…'}
                  >
                    {im.status === 'error' ? '⚠' : ''}
                  </div>
                );
              })}
            </div>
          )}

          {/* 定型后的生成图 */}
          {!streamImages && generatedImages && generatedImages.length > 0 && (
            <div className="bubble-generated">
              {generatedImages.map((img, i) => (
                <img
                  key={i}
                  src={toImageUrl(img)}
                  alt={`生成图 ${i + 1}`}
                  loading="lazy"
                  onClick={() => setPreview(img)}
                />
              ))}
            </div>
          )}
        </div>
        <time className="bubble-time">{timeStr}</time>
      </div>

      {preview && (
        <ImageModal
          src={preview}
          alt="图片预览"
          onClose={() => setPreview(null)}
          onUseAsReference={onPickReference ? handleUseAsReference : undefined}
        />
      )}
    </div>
  );
}
