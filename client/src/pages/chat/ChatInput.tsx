/* ═══════════════════════════════════════════
   ChatInput — 输入区
   - 文件选择:原生 <input type="file"> + FileReader
   - 参考图状态由父组件受控(imageValue/onImageChange),
     以便气泡里的图片可注入此处
   ═══════════════════════════════════════════ */

import { useState, useRef, useCallback } from 'react';
import Icon from '@/components/common/Icon';
import { fileToDataURL } from '@/lib/clipboard';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (message: string, imageBase64?: string) => void;
  disabled?: boolean;
  /** 受控参考图(dataURL);由 ChatPage 持有,允许从气泡注入 */
  imageValue: string | null;
  onImageChange: (value: string | null) => void;
}

const PLACEHOLDERS = [
  '描述你想要的鞋子…',
  '试试「红色网面运动鞋,白色鞋底」',
  '上传参考图 + 文字描述,效果更佳',
];

export default function ChatInput({
  onSend,
  disabled,
  imageValue,
  onImageChange,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* 选择图片(原生 input,替代 dialog.showOpenDialog) */
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        onImageChange(await fileToDataURL(file));
      } catch (err) {
        console.error('[ChatInput] 读取图片失败', err);
      }
    },
    [onImageChange],
  );

  /* 粘贴图片(浏览器原生) */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (!file) continue;
          fileToDataURL(file).then(onImageChange);
          return;
        }
      }
    },
    [onImageChange],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && !imageValue) || disabled) return;
    onSend(trimmed || '生成类似款式的鞋子', imageValue ?? undefined);
    setText('');
    onImageChange(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [text, imageValue, disabled, onSend, onImageChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    },
    [],
  );

  const placeholder =
    PLACEHOLDERS[text.length % PLACEHOLDERS.length] ?? PLACEHOLDERS[0];

  return (
    <div className="chat-input-wrap">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="chat-file-input"
        onChange={handleFileChange}
      />

      {imageValue && (
        <div className="image-preview">
          <img src={imageValue} alt="参考图" />
          <button
            className="image-preview-remove"
            onClick={() => onImageChange(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="chat-input-row">
        <button
          className="attach-btn"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="上传参考图片"
          type="button"
        >
          <Icon name="image" size={20} />
        </button>

        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          placeholder={placeholder}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
        />

        <button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !imageValue)}
          aria-label="发送"
          type="button"
        >
          <Icon name="send" size={20} />
        </button>
      </div>
    </div>
  );
}
