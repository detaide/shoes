/* ═══════════════════════════════════════════
   ChatPage — 对话页(纯 UI 组装)
   - session 驱动(默认最新,可切换/新建/删除)
   - 参考图状态上提:气泡内图片可注入输入框
   ═══════════════════════════════════════════ */

import { useState, useCallback } from 'react';
import Icon from '@/components/common/Icon';
import { useChat } from '@/features/chat/useChat';
import ChatList from './ChatList';
import ChatInput from './ChatInput';
import SessionPanel from './SessionPanel';
import './ChatPage.css';

export default function ChatPage() {
  const {
    session,
    messages,
    streaming,
    loading,
    generating,
    send,
    selectSession,
    newSession,
    removeSession,
  } = useChat();

  /* 受控参考图:允许从气泡注入 */
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const handlePickReference = useCallback((dataUrl: string) => {
    setInputImage(dataUrl);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      selectSession(id);
      setPanelOpen(false);
    },
    [selectSession],
  );

  const handleNew = useCallback(() => {
    newSession();
    setPanelOpen(false);
  }, [newSession]);

  return (
    <div className="chat-page">
      <header className="chat-header">
        <button
          className="session-trigger"
          onClick={() => setPanelOpen(true)}
          title="切换会话"
        >
          <Icon name="chat" size={16} />
          <span className="session-trigger-title">
            {session?.title || '新对话'}
          </span>
          <span className="session-trigger-arrow">‹</span>
        </button>

        <div className="chat-header-right">
          {generating && <span className="generating-badge">思考中…</span>}
          <button
            className="clear-btn"
            onClick={handleNew}
            title="新建会话"
          >
            新建
          </button>
        </div>
      </header>

      {!loading && (
        <ChatList
          messages={messages}
          streaming={streaming}
          onPickReference={handlePickReference}
        />
      )}

      <ChatInput
        onSend={send}
        disabled={generating}
        imageValue={inputImage}
        onImageChange={setInputImage}
      />

      <SessionPanel
        open={panelOpen}
        currentId={session?.id ?? null}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={removeSession}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
}
