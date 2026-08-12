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
        background: '#FFFFFF',
        borderLeft: '1px solid #D8DEE4',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
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
          padding: '10px 12px',
          borderBottom: '1px solid #EDF1F5',
          fontWeight: 700,
        }}
      >
        Historique de la ligne
        <button
          type="button"
          data-testid="history-close"
          aria-label="Fermer l’historique"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}
        >
          ×
        </button>
      </header>

      <div style={{ overflowY: 'auto', padding: '8px 12px' }}>
        {loading ? <p data-testid="history-loading">Chargement…</p> : null}

        {!loading && events.length === 0 ? (
          <p data-testid="history-empty">Aucun événement pour cette ligne.</p>
        ) : null}

        {!loading
          ? events.map((event) => (
              <article
                key={event.id}
                style={{ borderBottom: '1px solid #EDF1F5', padding: '6px 0' }}
              >
                <div>
                  <strong data-testid="history-type">{TYPE_LABELS[event.type]}</strong>{' '}
                  par <span data-testid="history-author">{event.userName}</span>
                </div>
                <div style={{ color: '#6B7785' }}>
                  {new Date(event.at).toLocaleString('fr-FR')}
                </div>
                <pre
                  style={{
                    margin: '4px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: '#F7F9FB',
                    padding: 6,
                    borderRadius: 3,
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
