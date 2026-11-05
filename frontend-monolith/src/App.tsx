import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { checkHealth } from './api/http';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { ScrollToTop } from './components/ScrollToTop';
import type { HealthMap } from './components/ServicesStatusPopover';
import { ENDORSE_API_BASE, ROUTES_API_BASE } from './config';
import { DocumentationPage } from './pages/DocumentationPage';
import { ProfilePage } from './pages/ProfilePage';
import { RetosPage } from './pages/RetosPage';

export function App(): ReactElement {
  const [health, setHealth] = useState<HealthMap>({ endorse: null, routes: null });

  // Sondeo periódico de salud sin bloquear la interfaz
  useEffect(() => {
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      const [endorse, routes] = await Promise.all([
        checkHealth(ENDORSE_API_BASE),
        checkHealth(ROUTES_API_BASE),
      ]);
      if (!cancelled) {
        setHealth({ endorse, routes });
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="landing-layout">
      {/* 1. Header fijo y sticky real */}
      <Navbar health={health} />

      {/* 2. Scroll to top en cada cambio de ruta */}
      <ScrollToTop />

      {/* 3. Enrutamiento SPA con páginas separadas */}
      <div className="main-content-flow">
        <Routes>
          <Route path="/" element={<Navigate to="/retos" replace />} />
          <Route path="/retos" element={<RetosPage />} />
          <Route path="/documentacion" element={<DocumentationPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/retos" replace />} />
        </Routes>
      </div>

      {/* 4. Footer compartido */}
      <Footer />
    </div>
  );
}
