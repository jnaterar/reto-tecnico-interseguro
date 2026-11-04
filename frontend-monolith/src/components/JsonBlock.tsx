import { useState } from 'react';

interface JsonBlockProps {
  value: unknown;
  label?: string;
}

/** Renderiza JSON legible con acción de copiar al portapapeles. */
export function JsonBlock({ value, label = 'JSON' }: JsonBlockProps) {
  const text = JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // El portapapeles puede no estar disponible (contexto no seguro); se ignora.
    }
  };

  return (
    <div className="json-block">
      <div className="json-block-head">
        <span className="json-block-label">{label}</span>
        <button type="button" className="ghost-button small" onClick={() => void copy()}>
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
