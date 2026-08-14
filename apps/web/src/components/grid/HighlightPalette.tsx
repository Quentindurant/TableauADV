'use client';

export const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: 'Rouge', value: '#FF0000' },
  { label: 'Jaune', value: '#FFFF00' },
  { label: 'Vert', value: '#9BDEB4' },
  { label: 'Bleu', value: '#85C1E9' },
  { label: 'Violet', value: '#C39BD3' },
];

export interface HighlightPaletteProps {
  onPick: (color: string | null) => void;
}

export function HighlightPalette({ onPick }: HighlightPaletteProps) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 10px' }}>
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          data-testid={`highlight-${color.value}`}
          title={color.label}
          aria-label={`Surligner en ${color.label.toLowerCase()}`}
          onClick={() => onPick(color.value)}
          style={{
            width: 18,
            height: 18,
            padding: 0,
            borderRadius: '50%',
            border: '1px solid var(--gc-border)',
            // `background` = couleur MÉTIER du surlignage, jamais un token.
            background: color.value,
            cursor: 'pointer',
          }}
        />
      ))}
      <button
        type="button"
        data-testid="highlight-clear"
        onClick={() => onPick(null)}
        style={{
          border: '1px solid var(--gc-border)',
          borderRadius: 'var(--gc-radius-pill)',
          background: 'var(--gc-surface)',
          color: 'var(--gc-muted)',
          cursor: 'pointer',
          fontSize: 12,
          padding: '2px 10px',
        }}
      >
        Effacer
      </button>
    </div>
  );
}
