'use client';

export const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: 'Rouge', value: '#EE7A6D' },
  { label: 'Orange', value: '#F5B041' },
  { label: 'Jaune', value: '#F7DC6F' },
  { label: 'Vert', value: '#7DCEA0' },
  { label: 'Bleu', value: '#85C1E9' },
  { label: 'Violet', value: '#BB8FCE' },
];

/**
 * Colonnes restreintes à un sous-ensemble de la palette (labels de
 * HIGHLIGHT_COLORS). Toute colonne absente de la table garde les 6 couleurs.
 */
export const HIGHLIGHT_RESTRICTIONS: Record<string, string[]> = {
  impe: ['Rouge', 'Orange'],
};

export interface HighlightPaletteProps {
  /** Clé de la colonne ciblée : filtre la palette via HIGHLIGHT_RESTRICTIONS. */
  colKey?: string;
  onPick: (color: string | null) => void;
}

export function HighlightPalette({ colKey, onPick }: HighlightPaletteProps) {
  const autorisees = colKey ? HIGHLIGHT_RESTRICTIONS[colKey] : undefined;
  const couleurs = autorisees
    ? HIGHLIGHT_COLORS.filter((color) => autorisees.includes(color.label))
    : HIGHLIGHT_COLORS;
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 10px' }}>
      {couleurs.map((color) => (
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
