import { useEffect, type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Restaura el scroll a (0, 0) en cada cambio de ruta.
 */
export function ScrollToTop(): ReactElement | null {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

