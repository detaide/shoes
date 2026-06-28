/* ═══════════════════════════════════════════
   SessionPanel — 会话切换抽屉
   列出全部会话,可选择/新建/删除
   ═══════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/common/Icon';
import { listSessions } from '@/features/sessions/sessionApi';
import type { SessionSummary } from '@shared/types';
import './SessionPanel.css';

interface SessionPanelProps {
  open: boolean;
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export default function SessionPanel({
  open,
  currentId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await listSessions());
    } catch (err) {
      console.error('[SessionPanel] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!confirm('删除该会话?此操作不可撤销。')) return;
      await onDelete(id);
      reload();
    },
    [onDelete, reload],
  );

  if (!open) return null;

  return (
    <div className="session-overlay" onClick={onClose}>
      <div className="session-panel" onClick={(e) => e.stopPropagation()}>
        <div className="session-panel-header">
          <span>会话</span>
          <button className="session-new-btn" onClick={onNew} title="新建会话">
            + 新建
          </button>
        </div>

        <div className="session-list">
          {loading && sessions.length === 0 && (
            <div className="session-empty">加载中…</div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="session-empty">暂无会话</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item${s.id === currentId ? ' active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <Icon name="chat" size={16} filled={s.id === currentId} />
              <div className="session-item-main">
                <span className="session-item-title">{s.title || '新对话'}</span>
                <span className="session-item-meta">
                  {fmtTime(s.updatedAt)} · {s.messageCount} 条
                </span>
              </div>
              <button
                className="session-item-del"
                onClick={(e) => handleDelete(e, s.id)}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
