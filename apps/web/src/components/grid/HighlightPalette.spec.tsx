import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HIGHLIGHT_COLORS, HighlightPalette } from './HighlightPalette';

describe('HighlightPalette', () => {
  it('expose les cinq couleurs de la spec', () => {
    expect(HIGHLIGHT_COLORS.map((color) => color.value)).toEqual([
      '#FF0000',
      '#FFFF00',
      '#9BDEB4',
      '#85C1E9',
      '#C39BD3',
    ]);
  });

  it('remonte la couleur choisie', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<HighlightPalette onPick={onPick} />);
    await user.click(screen.getByTestId('highlight-#9BDEB4'));
    expect(onPick).toHaveBeenCalledWith('#9BDEB4');
  });

  it('remonte null pour « Effacer »', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<HighlightPalette onPick={onPick} />);
    await user.click(screen.getByTestId('highlight-clear'));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
