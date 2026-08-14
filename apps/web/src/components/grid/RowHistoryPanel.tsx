'use client';

import type { RowEventDTO } from '@suivi/shared';

const TYPE_LABELS: Record<RowEventDTO['type'], string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  move: 'Déplacement',
  archive: 'Archivage',
  format: 'Surlignage',
};

export interface RowHistoryPanelProps {
  events: RowEventDTO[];
  loading: boolean;
  onClose: () => void;
}

export function RowHistoryPanel({ events, loading, onClose }: RowHistoryPanelProps) {
  return (
    <aside
      data-testid="history-panel"
      aria-label="Historique de la ligne"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        zIndex: 1100,
        background: 'var(--gc-surface)',
        borderLeft: '1px solid var(--gc-border)',
        boxShadow: 'var(--gc-shadow-panel)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 13,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--gc-border)',
          background: 'var(--gc-surface-alt)',
          color: 'var(--gc-petrol)',
          fontWeight: 800,
        }}
      >
        Historique de la ligne
        <button
          type="button"
          data-testid="history-close"
          aria-label="Fermer l’historique"
          onClick={onClose}
          style={{
            border: 'none',
            borderRadius: 'var(--gc-radius-sm)',
            background: 'transparent',
            color: 'var(--gc-muted)',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 6px',
          }}
        >
          ×
        </button>
      </header>

      <div style={{ overflowY: 'auto', padding: '10px 16px' }}>
        {loading ? <p data-testid="history-loading">Chargement…</p> : null}

        {!loading && events.length === 0 ? (
          <p data-testid="history-empty">Aucun événement pour cette ligne.</p>
        ) : null}

        {!loading
          ? events.map((event) => (
              <article
                key={event.id}
                style={{ borderBottom: '1px solid var(--gc-border-soft)', padding: '8px 0' }}
              >
                <div>
                  <strong data-testid="history-type">{TYPE_LABELS[event.type]}</strong>{' '}
                  par <span data-testid="history-author">{event.userName}</span>
                </div>
                <div style={{ color: 'var(--gc-muted)' }}>
                  {new Date(event.at).toLocaleString('fr-FR')}
                </div>
                <pre
                  style={{
                    margin: '4px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: 'var(--gc-surface-alt)',
                    color: 'var(--gc-petrol-soft)',
                    padding: 8,
                    borderRadius: 'var(--gc-radius-sm)',
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </article>
            ))
          : null}
      </div>
    </aside>
  );
}
