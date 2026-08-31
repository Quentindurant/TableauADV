import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HIGHLIGHT_COLORS, HIGHLIGHT_RESTRICTIONS, HighlightPalette } from './HighlightPalette';

describe('HighlightPalette', () => {
  it('expose les six couleurs de la spec, dans l’ordre', () => {
    expect(HIGHLIGHT_COLORS.map((color) => color.value)).toEqual([
      '#EE7A6D',
      '#F5B041',
      '#F7DC6F',
      '#7DCEA0',
      '#85C1E9',
      '#BB8FCE',
    ]);
  });

  it('restreint IMPE au rouge et à l’orange', () => {
    expect(HIGHLIGHT_RESTRICTIONS).toEqual({ impe: ['Rouge', 'Orange'] });
  });

  it('remonte la couleur choisie', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<HighlightPalette onPick={onPick} />);
    await user.click(screen.getByTestId('highlight-#7DCEA0'));
    expect(onPick).toHaveBeenCalledWith('#7DCEA0');
  });

  it('n’affiche que rouge et orange pour la colonne IMPE, avec « Effacer »', () => {
    render(<HighlightPalette colKey="impe" onPick={vi.fn()} />);
    expect(screen.getByTestId('highlight-#EE7A6D')).toBeInTheDocument();
    expect(screen.getByTestId('highlight-#F5B041')).toBeInTheDocument();
    expect(screen.queryByTestId('highlight-#F7DC6F')).not.toBeInTheDocument();
    expect(screen.queryByTestId('highlight-#7DCEA0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('highlight-#85C1E9')).not.toBeInTheDocument();
    expect(screen.queryByTestId('highlight-#BB8FCE')).not.toBeInTheDocument();
    expect(screen.getByTestId('highlight-clear')).toBeInTheDocument();
  });

  it('affiche les six couleurs pour une colonne sans restriction', () => {
    render(<HighlightPalette colKey="client" onPick={vi.fn()} />);
    for (const color of HIGHLIGHT_COLORS) {
      expect(screen.getByTestId(`highlight-${color.value}`)).toBeInTheDocument();
    }
  });

  it('remonte null pour « Effacer »', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<HighlightPalette onPick={onPick} />);
    await user.click(screen.getByTestId('highlight-clear'));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
