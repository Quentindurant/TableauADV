import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('pré-remplit le champ avec la requête initiale', () => {
    render(<SearchBar initialQuery="ARCADIA" onSubmit={vi.fn()} />);
    expect((screen.getByTestId('search-input') as HTMLInputElement).value).toBe('ARCADIA');
  });

  it('remonte la requête à la validation du formulaire', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchBar onSubmit={onSubmit} />);
    await user.type(screen.getByTestId('search-input'), 'NEO{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('NEO');
  });

  it('ignore une recherche vide', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchBar onSubmit={onSubmit} />);
    await user.type(screen.getByTestId('search-input'), '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
