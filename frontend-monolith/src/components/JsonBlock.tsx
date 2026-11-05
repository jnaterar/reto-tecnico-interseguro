import { useState, type ReactElement } from 'react';

interface JsonBlockProps {
  value: unknown;
  label?: string;
}

/** Renderiza JSON legible con acción de copiar al portapapeles. */
export function JsonBlock({ value, label = 'JSON' }: JsonBlockProps): ReactElement {
  const text = JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API no disponible');
      }
    } catch {
      // Fallback accesible para entornos restringidos o headless
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      } catch {
        // Ignorar error si el portapapeles está completamente bloqueado
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="json-block">
      <div className="json-block-head">
        <span className="json-block-label">{label}</span>
        <button
          type="button"
          className={`code-copy-button ${copied ? 'is-copied' : ''}`}
          onClick={() => void copy()}
          aria-label={`Copiar bloque ${label}`}
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
