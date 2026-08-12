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
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 8px' }}>
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
            borderRadius: 3,
            border: '1px solid #99A3AD',
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
          border: '1px solid #99A3AD',
          borderRadius: 3,
          background: '#FFFFFF',
          cursor: 'pointer',
          fontSize: 12,
          padding: '1px 6px',
        }}
      >
        Effacer
      </button>
    </div>
  );
}
