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

/**
 * Couleurs de TEXTE (les trois du classeur Zoho). Volontairement sombres :
 * contraste 6,4 à 8,5 sur fond blanc, et lisibles par-dessus les surlignages
 * clairs. La couleur reste un accent — le texte porte l'information.
 */
export const TEXT_COLORS: { label: string; value: string }[] = [
  { label: 'Rouge', value: '#B02418' },
  { label: 'Vert', value: '#186A3B' },
  { label: 'Bleu', value: '#1A5276' },
];

export interface HighlightPaletteProps {
  /** Clé de la colonne ciblée : filtre la palette via HIGHLIGHT_RESTRICTIONS. */
  colKey?: string;
  onPick: (color: string | null) => void;
  /** Couleur du texte de la cellule ; `null` = retour au noir. */
  onPickText?: (color: string | null) => void;
  /** Type de la colonne : les SELECT rendent une pastille, pas de texte coloré. */
  columnType?: string;
}

export function HighlightPalette({
  colKey,
  onPick,
  onPickText,
  columnType,
}: HighlightPaletteProps) {
  const autorisees = colKey ? HIGHLIGHT_RESTRICTIONS[colKey] : undefined;
  const couleurs = autorisees
    ? HIGHLIGHT_COLORS.filter((color) => autorisees.includes(color.label))
    : HIGHLIGHT_COLORS;
  return (
    <>
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
      {/* Couleur du texte : sans objet sur les colonnes SELECT, dont le rendu
          en pastille porte déjà les couleurs du choix. */}
      {onPickText && columnType !== 'SELECT' ? (
        <div
          data-testid="text-color-row"
          style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '0 10px 4px' }}
        >
          {TEXT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              data-testid={`text-color-${color.value}`}
              title={`Texte en ${color.label.toLowerCase()}`}
              aria-label={`Texte en ${color.label.toLowerCase()}`}
              onClick={() => onPickText(color.value)}
              style={{
                width: 18,
                height: 18,
                padding: 0,
                borderRadius: 'var(--gc-radius-sm)',
                border: '1px solid var(--gc-border)',
                background: 'var(--gc-surface)',
                // `color` = couleur MÉTIER du texte, jamais un token.
                color: color.value,
                fontWeight: 800,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              A
            </button>
          ))}
          <button
            type="button"
            data-testid="text-color-clear"
            onClick={() => onPickText(null)}
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
            Texte noir
          </button>
        </div>
      ) : null}
    </>
  );
}
