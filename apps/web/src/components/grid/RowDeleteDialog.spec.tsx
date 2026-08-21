import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RowDTO } from '@suivi/shared';
import { RowDeleteDialog } from './RowDeleteDialog';

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 3,
  data: { client: 'ARCADIA' },
  formats: {},
  version: 1,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

function setup() {
  const props = { row, onCancel: vi.fn(), onConfirm: vi.fn() };
  render(<RowDeleteDialog {...props} />);
  return props;
}

describe('RowDeleteDialog', () => {
  it('affiche un dialogue modal avec la position de la ligne', () => {
    setup();
    const dialogue = screen.getByRole('dialog', {
      name: 'Confirmer la suppression de la ligne',
    });
    expect(dialogue).toHaveAttribute('aria-modal', 'true');
    expect(dialogue).toHaveTextContent('Supprimer la ligne 4 ?');
  });

  it('ne confirme rien tant que « Supprimer » n’est pas cliqué', () => {
    const props = setup();
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('« Annuler » ferme sans confirmer', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('« Supprimer » confirme la suppression', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Échap annule', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.keyboard('{Escape}');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
