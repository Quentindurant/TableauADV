import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthInfo, RowDTO } from '@suivi/shared';
import { RowContextMenu } from './RowContextMenu';

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

const months: MonthInfo[] = [
  { month: '2026-08', count: 10 },
  { month: '2026-09', count: 2 },
];

function setup(overrides: Partial<React.ComponentProps<typeof RowContextMenu>> = {}) {
  const props = {
    row,
    colKey: 'num_chrono',
    months,
    x: 100,
    y: 200,
    onClose: vi.fn(),
    onInsertAbove: vi.fn(),
    onInsertBelow: vi.fn(),
    onMoveToMonth: vi.fn(),
    onToggleArchive: vi.fn(),
    onDelete: vi.fn(),
    onShowHistory: vi.fn(),
    onHighlight: vi.fn(),
    ...overrides,
  };
  render(<RowContextMenu {...props} />);
  return props;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RowContextMenu', () => {
  it('propose l’insertion au-dessus et en-dessous', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-insert-above'));
    expect(props.onInsertAbove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('menu-insert-below'));
    expect(props.onInsertBelow).toHaveBeenCalledTimes(1);
  });

  it('ouvre le sous-menu des mois et exclut le mois courant de la ligne', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-move'));
    expect(screen.queryByTestId('menu-move-2026-08')).toBeNull();
    await user.click(screen.getByTestId('menu-move-2026-09'));
    expect(props.onMoveToMonth).toHaveBeenCalledWith('2026-09');
  });

  it('archive une ligne active, désarchive une ligne archivée', async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(screen.getByTestId('menu-archive').textContent).toBe('Archiver');
    await user.click(screen.getByTestId('menu-archive'));
    expect(props.onToggleArchive).toHaveBeenCalledTimes(1);
  });

  it('affiche « Désarchiver » pour une ligne archivée', () => {
    setup({ row: { ...row, archived: true } });
    expect(screen.getByTestId('menu-archive').textContent).toBe('Désarchiver');
  });

  it('demande la suppression de la ligne et ferme le menu (confirmation portée par le parent)', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-delete'));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ouvre l’historique et remonte un surlignage', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-history'));
    expect(props.onShowHistory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('highlight-#FFFF00'));
    expect(props.onHighlight).toHaveBeenCalledWith('#FFFF00');
  });

  it('se ferme sur Échap', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
