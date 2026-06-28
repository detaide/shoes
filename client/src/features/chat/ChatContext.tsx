/* ═══════════════════════════════════════════
   ChatProvider — 把 SSE 通道与聊天状态提到应用层
   随 AppShell 持久存活,切换 对话/图库/设置 时不再断开 SSE。
   ═══════════════════════════════════════════ */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { ChatMessage, Session } from '@shared/types';
import { openChatChannel, sendMessage } from './chatApi';
import { localStore } from '@/lib/storage';
import {
  getLatestSession,
  getSession,
  createSession,
  deleteSession,
} from '@/features/sessions/sessionApi';

let _msgId = 0;
function nextId(): string {
  return `msg_${Date.now()}_${++_msgId}`;
}
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 流式图片项(占位 → 成图/错误) */
export interface StreamImage {
  slot: string;
  status: 'pending' | 'ready' | 'error';
  name?: string;
  error?: string;
}

/** 进行中的流式助手消息 */
export interface StreamingMsg {
  id: string;
  content: string;
  images: StreamImage[];
  timestamp: number;
}

interface ChatContextValue {
  session: Session | null;
  messages: ChatMessage[];
  streaming: StreamingMsg | null;
  loading: boolean;
  generating: boolean;
  send: (text: string, imageBase64?: string) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  newSession: () => Promise<void>;
  removeSession: (id: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMsg | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const clientIdRef = useRef<string>('');
  const esRef = useRef<EventSource | null>(null);
  const turnRef = useRef<string>('');
  const sessionRef = useRef<Session | null>(null);

  /* 持久 SSE 通道 + 会话加载(随 Provider 挂载一次,跨路由存活) */
  useEffect(() => {
    let cid = localStore.get<string>('clientId', '');
    if (!cid) {
      cid = genId('c');
      localStore.set('clientId', cid);
    }
    clientIdRef.current = cid;

    const es = openChatChannel(cid, {
      onConnected: (d) => console.log('[chat] 通道就绪', d.clientId),
      onMeta: () => {},
      onText: (d) => {
        if (d.turnId !== turnRef.current) return;
        const piece = d.delta ?? d.text ?? '';
        if (piece) {
          setStreaming((prev) =>
            prev ? { ...prev, content: prev.content + piece } : prev,
          );
        }
      },
      onImageStart: (d) => {
        if (d.turnId !== turnRef.current) return;
        setStreaming((prev) =>
          prev
            ? { ...prev, images: [...prev.images, { slot: d.slot, status: 'pending' }] }
            : prev,
        );
      },
      onImageReady: (d) => {
        if (d.turnId !== turnRef.current) return;
        setStreaming((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((im) =>
                  im.slot === d.slot ? { ...im, status: 'ready', name: d.name } : im,
                ),
              }
            : prev,
        );
      },
      onImageError: (d) => {
        if (d.turnId !== turnRef.current) return;
        setStreaming((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((im) =>
                  im.slot === d.slot ? { ...im, status: 'error', error: d.error } : im,
                ),
              }
            : prev,
        );
      },
      onDone: (d) => {
        if (d.turnId !== turnRef.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: d.content,
            generatedImages: d.images,
            timestamp: Date.now(),
          },
        ]);
        setStreaming(null);
        setGenerating(false);
      },
      onError: (d) => {
        if (d.turnId && d.turnId !== turnRef.current) return;
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: `❌ ${d.message}`, timestamp: Date.now() },
        ]);
        setStreaming(null);
        setGenerating(false);
      },
    });
    esRef.current = es;

    (async () => {
      try {
        const s = await getLatestSession();
        sessionRef.current = s;
        setSession(s);
        setMessages(s.messages ?? []);
      } catch {
        /* 后端自动创建会话 */
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const send = useCallback(
    async (text: string, imageBase64?: string) => {
      const cur = sessionRef.current;
      if (generating || !cur || !clientIdRef.current) return;

      const turnId = genId('t');
      turnRef.current = turnId;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        attachedImages: imageBase64 ? [imageBase64] : undefined,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming({ id: turnId, content: '', images: [], timestamp: Date.now() });
      setGenerating(true);

      try {
        await sendMessage({
          clientId: clientIdRef.current,
          turnId,
          sessionId: cur.id,
          userText: text,
          imageBase64,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: `❌ 发送失败:${msg}`, timestamp: Date.now() },
        ]);
        setStreaming(null);
        setGenerating(false);
      }
    },
    [generating],
  );

  const selectSession = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const s = await getSession(id);
      sessionRef.current = s;
      setSession(s);
      setMessages(s.messages ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const newSession = useCallback(async () => {
    const created = await createSession();
    const s: Session = { ...created, messages: [], updatedAt: created.createdAt };
    sessionRef.current = s;
    setSession(s);
    setMessages([]);
  }, []);

  const removeSession = useCallback(async (id: string) => {
    await deleteSession(id);
    if (id === sessionRef.current?.id) {
      const latest = await getLatestSession();
      sessionRef.current = latest;
      setSession(latest);
      setMessages(latest.messages ?? []);
    }
  }, []);

  return (
    <ChatContext.Provider
      value={{ session, messages, streaming, loading, generating, send, selectSession, newSession, removeSession }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat 必须在 <ChatProvider> 内使用');
  return ctx;
}
