import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportFusionReportDTO } from '@suivi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({ importerClasseur: vi.fn() }));

import { importerClasseur } from '../../../../lib/api';
import ImportTab from '../import';

const importerClasseurMock = vi.mocked(importerClasseur);

const RAPPORT: ImportFusionReportDTO = {
  parOnglet: [
    {
      mois: '2026-08',
      creees: 2,
      misesAJour: 3,
      inchangees: 5,
      reordonnees: 7,
      ambiguites: [
        {
          client: 'CABINET LATES',
          raison: '1 ligne(s) fichier pour 2 ligne(s) en base',
          lignesFichier: [4],
          lignesBase: ['row-1', 'row-2'],
        },
      ],
      horsListe: ['valeur « X » hors liste pour la colonne statut (1 ligne(s)) — importée telle quelle'],
    },
    {
      mois: '2026-09',
      creees: 0,
      misesAJour: 1,
      inchangees: 8,
      reordonnees: 0,
      ambiguites: [],
      horsListe: [],
    },
  ],
  erreurs: [],
};

function fichierClasseur(nom = 'classeur.xlsx'): File {
  return new File(['contenu'], nom, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function deposerEtImporter(fichier: File): Promise<void> {
  const utilisateur = userEvent.setup();
  await utilisateur.upload(screen.getByLabelText('Fichier'), fichier);
  await utilisateur.click(screen.getByRole('button', { name: 'Importer' }));
}

beforeEach(() => {
  importerClasseurMock.mockReset();
});

describe('ImportTab', () => {
  it("désactive le bouton tant qu'aucun fichier n'est choisi", () => {
    render(<ImportTab />);

    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled();
    expect(screen.getByLabelText('Fichier')).toHaveAttribute('accept', '.xlsx');
  });

  it("montre l'état en cours pendant l'import puis le rapport par onglet", async () => {
    let terminer: (rapport: ImportFusionReportDTO) => void = () => undefined;
    importerClasseurMock.mockImplementationOnce(
      () => new Promise((resolve) => { terminer = resolve; }),
    );
    render(<ImportTab />);

    const fichier = fichierClasseur();
    await deposerEtImporter(fichier);

    expect(importerClasseurMock).toHaveBeenCalledWith(fichier);
    expect(screen.getByRole('button', { name: 'Import en cours…' })).toBeDisabled();

    terminer(RAPPORT);

    expect(await screen.findByRole('status')).toHaveTextContent('Import terminé');
    // Compteurs par onglet.
    const compteurs = within(screen.getByRole('table', { name: 'Fusion par onglet' }));
    const ligne = compteurs.getByRole('row', { name: /2026-08/ });
    expect(ligne).toHaveTextContent('2');
    expect(ligne).toHaveTextContent('3');
    expect(ligne).toHaveTextContent('5');
    expect(ligne).toHaveTextContent('7');
    expect(compteurs.getByRole('columnheader', { name: 'Réordonnées' })).toBeInTheDocument();
    expect(compteurs.getByRole('row', { name: /2026-09/ })).toBeInTheDocument();
    // Tableau des ambiguïtés.
    expect(screen.getByText('CABINET LATES')).toBeInTheDocument();
    expect(screen.getByText('1 ligne(s) fichier pour 2 ligne(s) en base')).toBeInTheDocument();
    // Valeurs hors liste signalées.
    expect(screen.getByText(/hors liste pour la colonne statut/)).toBeInTheDocument();
    // Le bouton redevient utilisable.
    expect(screen.getByRole('button', { name: 'Importer' })).toBeEnabled();
  });

  it("affiche l'erreur si l'import échoue", async () => {
    importerClasseurMock.mockRejectedValueOnce({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Données invalides.',
    });
    render(<ImportTab />);

    await deposerEtImporter(fichierClasseur());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Données invalides : vérifiez les champs saisis.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('affiche les erreurs par onglet remontées dans le rapport', async () => {
    importerClasseurMock.mockResolvedValueOnce({
      parOnglet: [],
      erreurs: ['AOUT 2026 : transaction interrompue'],
    });
    render(<ImportTab />);

    await deposerEtImporter(fichierClasseur());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('AOUT 2026 : transaction interrompue');
    });
  });
});
