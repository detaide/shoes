/* useChat 现已由 ChatProvider 提供(随 AppShell 持久存活,跨路由不断开 SSE)。
   本文件保留为导入入口,供 ChatPage/ChatList/ChatBubble 等沿用旧路径。 */
export { useChat } from './ChatContext';
export type { StreamImage, StreamingMsg } from './ChatContext';
