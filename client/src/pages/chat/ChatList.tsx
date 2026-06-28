import { useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '@shared/types';
import type { StreamingMsg } from '@/features/chat/useChat';
import ChatBubble from './ChatBubble';
import './ChatList.css';

interface ChatListProps {
  messages: ChatMessage[];
  streaming?: StreamingMsg | null;
  onPickReference?: (dataUrl: string) => void;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好!我是 AI 鞋类设计助手。\n可以和我聊聊鞋类设计、要建议,或直接让我生成/修改商品图(描述需求,或上传参考图后告诉我要怎么改)。\n点击下方任意图片可在预览中「用作参考图」继续生成。',
  timestamp: 0,
};

export default function ChatList({ messages, streaming, onPickReference }: ChatListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  const list = messages.length > 0 ? messages : [WELCOME];

  return (
    <div className="chat-list" ref={listRef}>
      {list.map((msg) => (
        <ChatBubble key={msg.id} {...msg} onPickReference={onPickReference} />
      ))}
      {streaming && (
        <ChatBubble
          role="assistant"
          content={streaming.content}
          timestamp={streaming.timestamp}
          streamImages={streaming.images}
          onPickReference={onPickReference}
        />
      )}
    </div>
  );
}
