/* ═══════════════════════════════════════════
   useChat — 基于 持久 SSE 通道 的聊天
   - 挂载:建立 EventSource 长连接(跨消息复用)
   - 发送:POST /send(仅 ACK);文字/图片事件经通道推送
   - 按轮次 turnId 过滤事件,防串扰
   ═══════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useChat() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMsg | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const clientIdRef = useRef<string>('');
  const esRef = useRef<EventSource | null>(null);
  const turnRef = useRef<string>('');
  const sessionRef = useRef<Session | null>(null);

  /* 持久 SSE 通道 + 会话加载 */
  useEffect(() => {
    // 稳定 clientId(跨刷新复用)
    let cid = localStore.get<string>('clientId', '');
    if (!cid) {
      cid = genId('c');
      localStore.set('clientId', cid);
    }
    clientIdRef.current = cid;

    const es = openChatChannel(cid, {
      onConnected: (d) => console.log('[chat] 通道就绪', d.clientId),
      onMeta: (d) => {
        if (d.turnId && d.turnId !== turnRef.current) return;
      },
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

    // 加载最新会话
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

  /* 发送:仅 POST 触发,事件经通道到达 */
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
        // done/error 由通道监听器收尾
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

  return {
    session,
    messages,
    streaming,
    loading,
    generating,
    send,
    selectSession,
    newSession,
    removeSession,
  };
}
