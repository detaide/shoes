/* ═══════════════════════════════════════════
   SettingsPage — 设置页
   改造点:API Key 服务端托管,仅显示 hasApiKey
   状态;用户可填入新密钥覆盖。逻辑下沉 useSettings
   ═══════════════════════════════════════════ */

import { useState, useCallback } from 'react';
import Icon from '@/components/common/Icon';
import { useSettings } from '@/features/settings/useSettings';
import './SettingsPage.css';

export default function SettingsPage() {
  const { form, loading, patch, save, reset } = useSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const flash = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await save();
      flash();
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : err}`);
    }
  }, [save, flash]);

  const handleReset = useCallback(async () => {
    if (!confirm('将恢复配置为默认值,确定?')) return;
    try {
      await reset();
      flash();
    } catch (err) {
      alert(`重置失败: ${err instanceof Error ? err.message : err}`);
    }
  }, [reset, flash]);

  if (loading) {
    return (
      <div className="settings-page">
        <header className="settings-header">
          <Icon name="settings" size={18} />
          <span>设置</span>
        </header>
        <div className="settings-body">
          <p className="settings-loading">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <Icon name="settings" size={18} />
        <span>设置</span>
      </header>

      <div className="settings-body">
        {/* 千问平台 */}
        <div className="setting-group">
          <h3>千问平台</h3>
          <div className="setting-field">
            <label>API Base URL</label>
            <input
              className="setting-input"
              value={form.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
              placeholder="https://dashscope.aliyuncs.com"
            />
            <span className="setting-hint">华北2(北京)地域</span>
          </div>
          <div className="setting-field">
            <label>API Key</label>
            <div className="setting-input-row">
              <input
                className="setting-input mono"
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder={
                  form.hasApiKey
                    ? '已配置密钥(留空保持不变)'
                    : 'sk-xxxxxxxxxxxxxxxx'
                }
              />
              <button
                className="setting-toggle-btn"
                onClick={() => setShowApiKey((v) => !v)}
                title={showApiKey ? '隐藏' : '显示'}
                type="button"
              >
                {showApiKey ? '🙈' : '👁'}
              </button>
            </div>
            <span className="setting-hint">
              密钥保存在服务端,前端不显示明文
            </span>
          </div>
        </div>

        {/* 模型配置 */}
        <div className="setting-group">
          <h3>模型配置</h3>
          <div className="setting-field">
            <label>多模态模型(润色用)</label>
            <input
              className="setting-input mono"
              value={form.multimodalModel}
              onChange={(e) => patch({ multimodalModel: e.target.value })}
            />
          </div>
          <div className="setting-field">
            <label>生图模型</label>
            <input
              className="setting-input mono"
              value={form.imageModel}
              onChange={(e) => patch({ imageModel: e.target.value })}
            />
          </div>
          <div className="setting-readonly">
            <span>默认尺寸</span>
            <code>1024×1024</code>
          </div>
          <div className="setting-readonly">
            <span>默认数量</span>
            <code>1 张(对话中可指定)</code>
          </div>
          <div className="setting-readonly">
            <span>系统提示词</span>
            <code>由后端配置</code>
          </div>
        </div>

        {/* 预设提示词:已作废 —— 提示词完全由后端配置 */}

        {/* 保存 / 恢复 */}
        <div className="setting-actions">
          <button className="setting-save-btn" onClick={handleSave}>
            {saved ? '✅ 已保存' : '保存配置'}
          </button>
          <button className="setting-reset-btn" onClick={handleReset}>
            恢复默认
          </button>
        </div>

        {/* 关于 */}
        <div className="setting-group setting-about">
          <h3>关于</h3>
          <div className="setting-readonly">
            <span>版本</span>
            <code>v1.0</code>
          </div>
          <div className="setting-readonly">
            <span>框架</span>
            <code>Vite + React 19 + Node</code>
          </div>
          <div className="setting-readonly">
            <span>平台</span>
            <code>阿里云 DashScope(千问)</code>
          </div>
        </div>
      </div>
    </div>
  );
}
