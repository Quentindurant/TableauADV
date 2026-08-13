import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../colonnes', () => ({ default: () => <div>PANNEAU COLONNES</div> }));
vi.mock('../listes', () => ({ default: () => <div>PANNEAU LISTES</div> }));
vi.mock('../equipe', () => ({ default: () => <div>PANNEAU EQUIPE</div> }));

import ParametresPage from '../page';

describe('ParametresPage — onglets', () => {
  it('affiche les trois onglets et ouvre « Colonnes » par défaut', () => {
    render(<ParametresPage />);

    expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Colonnes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Listes & couleurs' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Équipe' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('PANNEAU COLONNES')).toBeInTheDocument();
  });

  it('bascule sur « Listes & couleurs » puis « Équipe »', async () => {
    const utilisateur = userEvent.setup();
    render(<ParametresPage />);

    await utilisateur.click(screen.getByRole('tab', { name: 'Listes & couleurs' }));
    expect(screen.getByText('PANNEAU LISTES')).toBeInTheDocument();
    expect(screen.queryByText('PANNEAU COLONNES')).not.toBeInTheDocument();

    await utilisateur.click(screen.getByRole('tab', { name: 'Équipe' }));
    expect(screen.getByText('PANNEAU EQUIPE')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Équipe' })).toHaveAttribute('aria-selected', 'true');
  });
});
