/* ═══════════════════════════════════════════
   导航项定义 — Sidebar / MobileTabBar 共用
   ═══════════════════════════════════════════ */

import type { IconName } from '@/components/common/Icon';

export interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'chat', path: '/chat', label: '对话', icon: 'chat' },
  { key: 'gallery', path: '/gallery', label: '图库', icon: 'gallery' },
  { key: 'settings', path: '/settings', label: '设置', icon: 'settings' },
];
