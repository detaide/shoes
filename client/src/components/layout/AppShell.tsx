import { Outlet } from 'react-router-dom';
import { useResponsive } from '@/hooks/useResponsive';
import { ChatProvider } from '@/features/chat/ChatContext';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import './AppShell.css';

export default function AppShell() {
  const { isDesktop } = useResponsive();

  return (
    <ChatProvider>
      <div className={`app-shell${isDesktop ? ' desktop' : ' mobile'}`}>
        {isDesktop && <Sidebar />}

        <main className="app-content">
          <Outlet />
        </main>

        {!isDesktop && <MobileTabBar />}
      </div>
    </ChatProvider>
  );
}
