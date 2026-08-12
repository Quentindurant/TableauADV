import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChoiceDTO } from '@suivi/shared';
import { SelectCellEditor } from './SelectCellEditor';

const choices: ChoiceDTO[] = [
  {
    id: 'ch-1',
    columnId: 'col-statut',
    label: 'NEW',
    bgColor: '#FFFF00',
    textColor: '#FF0000',
    bold: true,
    position: 0,
    archived: false,
  },
  {
    id: 'ch-2',
    columnId: 'col-statut',
    label: 'INSTALLATION',
    bgColor: '#9BDEB4',
    textColor: '#176638',
    bold: true,
    position: 1,
    archived: false,
  },
  {
    id: 'ch-3',
    columnId: 'col-statut',
    label: 'ANCIEN STATUT',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 2,
    archived: true,
  },
];

describe('SelectCellEditor', () => {
  it('liste les choix non archivés, pas les archivés', () => {
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={vi.fn()}
        stopEditing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('select-option-NEW')).toBeDefined();
    expect(screen.getByTestId('select-option-INSTALLATION')).toBeDefined();
    expect(screen.queryByTestId('select-option-ANCIEN STATUT')).toBeNull();
  });

  it('filtre la liste au clavier, sans tenir compte de la casse', async () => {
    const user = userEvent.setup();
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={vi.fn()}
        stopEditing={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId('select-filter'), 'insta');
    expect(screen.queryByTestId('select-option-NEW')).toBeNull();
    expect(screen.getByTestId('select-option-INSTALLATION')).toBeDefined();
  });

  it('remonte la valeur et ferme l\'édition au clic sur un choix', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.click(screen.getByTestId('select-option-INSTALLATION'));
    expect(onValueChange).toHaveBeenCalledWith('INSTALLATION');
    expect(stopEditing).toHaveBeenCalledWith();
  });

  it('valide au clavier : flèche bas puis Entrée', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.type(screen.getByTestId('select-filter'), '{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('NEW');
    expect(stopEditing).toHaveBeenCalledWith();
  });

  it('Échap annule sans modifier la valeur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value="NEW"
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.type(screen.getByTestId('select-filter'), '{Escape}');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(stopEditing).toHaveBeenCalledWith(true);
  });

  it('propose « Vider la cellule » qui remonte null', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value="NEW"
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.click(screen.getByTestId('select-clear'));
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(stopEditing).toHaveBeenCalledWith();
  });
});
