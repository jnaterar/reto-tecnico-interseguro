import { useEffect, type ReactElement } from 'react';

interface LightboxProps {
  isOpen: boolean;
  imageUrl: string;
  caption: string;
  onClose: () => void;
}

/**
 * Modal de visualización de diagramas a pantalla completa sin librerías externas.
 * Soporta cierre por teclado (Esc), click en backdrop y botón de cierre accesible.
 */
export function Lightbox({ isOpen, imageUrl, caption, onClose }: LightboxProps): ReactElement | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista ampliada: ${caption}`}
      onClick={onClose}
    >
      <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
        <header className="lightbox-header">
          <span className="lightbox-caption">{caption}</span>
          <button
            type="button"
            className="lightbox-close-button"
            aria-label="Cerrar vista previa (Esc)"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="lightbox-image-wrapper">
          <img src={imageUrl} alt={caption} className="lightbox-image" />
        </div>
        <footer className="lightbox-footer">
          <p className="muted small">Haz click fuera o presiona <kbd>Esc</kbd> para cerrar.</p>
        </footer>
      </div>
    </div>
  );
}
