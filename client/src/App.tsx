import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import ChatRoute from '@/routes/ChatRoute';
import GalleryRoute from '@/routes/GalleryRoute';
import SettingsRoute from '@/routes/SettingsRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatRoute />} />
          <Route path="/gallery" element={<GalleryRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
