import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RowEventDTO } from '@suivi/shared';
import { RowHistoryPanel } from './RowHistoryPanel';

const events: RowEventDTO[] = [
  {
    id: 'ev-2',
    rowId: 'row-1',
    userId: 'u-1',
    userName: 'Quentin',
    at: '2026-08-10T10:05:00.000Z',
    type: 'update',
    payload: { statut: { from: 'NEW', to: 'INSTALLATION' } },
  },
  {
    id: 'ev-1',
    rowId: 'row-1',
    userId: 'u-2',
    userName: 'Laurent',
    at: '2026-08-10T09:00:00.000Z',
    type: 'create',
    payload: {},
  },
];

describe('RowHistoryPanel', () => {
  it('affiche un état de chargement', () => {
    render(<RowHistoryPanel events={[]} loading onClose={vi.fn()} />);
    expect(screen.getByTestId('history-loading').textContent).toBe('Chargement…');
  });

  it('traduit les types d’événement et nomme l’auteur', () => {
    render(<RowHistoryPanel events={events} loading={false} onClose={vi.fn()} />);
    const types = screen.getAllByTestId('history-type').map((node) => node.textContent);
    expect(types).toEqual(['Modification', 'Création']);
    expect(screen.getAllByTestId('history-author')[0].textContent).toBe('Quentin');
  });

  it('indique quand il n’y a aucun événement', () => {
    render(<RowHistoryPanel events={[]} loading={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('history-empty').textContent).toBe(
      'Aucun événement pour cette ligne.',
    );
  });

  it('se ferme au clic sur le bouton de fermeture', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RowHistoryPanel events={events} loading={false} onClose={onClose} />);
    await user.click(screen.getByTestId('history-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
