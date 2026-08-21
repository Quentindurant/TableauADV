import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AidePage from '../page';

const TITRES_SECTIONS = [
  'Prise en main',
  'Le tableau',
  'Mois et archives',
  'Filtres et recherche',
  'Menu du clic droit',
  'Travailler à plusieurs',
  'Paramètres',
  'Import du classeur',
];

describe('AidePage — documentation intégrée', () => {
  it('affiche le titre et les huit sections', () => {
    render(<AidePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Aide' })).toBeInTheDocument();
    for (const titre of TITRES_SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: titre })).toBeInTheDocument();
    }
  });

  it('relie chaque entrée du sommaire à une section existante', () => {
    const { container } = render(<AidePage />);

    const sommaire = screen.getByRole('navigation', { name: 'Sommaire' });
    const liens = within(sommaire).getAllByRole('link');
    expect(liens).toHaveLength(TITRES_SECTIONS.length);

    for (const lien of liens) {
      const ancre = lien.getAttribute('href') ?? '';
      expect(ancre.startsWith('#')).toBe(true);
      const cible = container.querySelector(`section[id="${ancre.slice(1)}"]`);
      expect(cible).not.toBeNull();
    }
  });

  it('documente la prise en main : connexion, mois, édition, filtre', () => {
    render(<AidePage />);

    const section = screen.getByRole('region', { name: 'Prise en main' });
    expect(within(section).getByText(/Se connecter/)).toBeInTheDocument();
    expect(within(section).getByText(/Choisir son mois/)).toBeInTheDocument();
    expect(within(section).getByText(/Éditer une cellule/)).toBeInTheDocument();
    expect(within(section).getByText(/Poser un filtre/)).toBeInTheDocument();
  });

  it('documente les cinq onglets réels des Paramètres', () => {
    render(<AidePage />);

    const section = screen.getByRole('region', { name: 'Paramètres' });
    for (const onglet of [
      'Colonnes',
      'Listes & couleurs',
      'Techniciens terrain',
      'Équipe',
      'Import',
    ]) {
      expect(within(section).getByRole('rowheader', { name: onglet })).toBeInTheDocument();
    }
  });

  it('documente les règles réelles de la fusion d’import', () => {
    render(<AidePage />);

    const section = screen.getByRole('region', { name: 'Import du classeur' });
    expect(within(section).getByText('Jamais de suppression')).toBeInTheDocument();
    expect(within(section).getByText('Cellule vide dans le fichier')).toBeInTheDocument();
    expect(within(section).getByText(/le fichier fait foi/)).toBeInTheDocument();
  });
});
