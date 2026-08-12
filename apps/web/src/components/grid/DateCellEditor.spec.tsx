import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateCellEditor } from './DateCellEditor';

describe('DateCellEditor', () => {
  it('pré-remplit un input date avec la valeur ISO', () => {
    render(
      <DateCellEditor value="2026-08-14" onValueChange={vi.fn()} stopEditing={vi.fn()} />,
    );
    const input = screen.getByTestId('date-input') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-08-14');
  });

  it('remonte la nouvelle date au format ISO', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DateCellEditor value={null} onValueChange={onValueChange} stopEditing={vi.fn()} />,
    );
    await user.type(screen.getByTestId('date-input'), '2026-09-01');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-09-01');
  });

  it('remonte null quand la date est effacée', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DateCellEditor
        value="2026-08-14"
        onValueChange={onValueChange}
        stopEditing={vi.fn()}
      />,
    );
    await user.clear(screen.getByTestId('date-input'));
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it('Entrée valide, Échap annule', async () => {
    const user = userEvent.setup();
    const stopEditing = vi.fn();
    render(
      <DateCellEditor value={null} onValueChange={vi.fn()} stopEditing={stopEditing} />,
    );
    const input = screen.getByTestId('date-input');
    await user.type(input, '{Enter}');
    expect(stopEditing).toHaveBeenLastCalledWith();
    await user.type(input, '{Escape}');
    expect(stopEditing).toHaveBeenLastCalledWith(true);
  });
});
