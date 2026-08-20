'use client';

import type { ImportFusionReportDTO } from '@suivi/shared';
import { useState, type FormEvent } from 'react';

import { importerClasseur } from '../../../lib/api';
import { messageErreurApi } from './messages';

export default function ImportTab() {
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [rapport, setRapport] = useState<ImportFusionReportDTO | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const importer = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
    evenement.preventDefault();
    if (fichier === null || enCours) {
      return;
    }
    setEnCours(true);
    setErreur(null);
    setRapport(null);
    try {
      setRapport(await importerClasseur(fichier));
    } catch (err) {
      setErreur(messageErreurApi(err));
    } finally {
      setEnCours(false);
    }
  };

  const ambiguites =
    rapport?.parOnglet.flatMap((onglet) =>
      onglet.ambiguites.map((ambiguite) => ({ mois: onglet.mois, ...ambiguite })),
    ) ?? [];
  const horsListe =
    rapport?.parOnglet.flatMap((onglet) =>
      onglet.horsListe.map((valeur) => `${onglet.mois} — ${valeur}`),
    ) ?? [];

  return (
    <section aria-label="Import">
      {erreur !== null && <p role="alert">{erreur}</p>}

      <form
        onSubmit={(evenement) => {
          void importer(evenement);
        }}
      >
        <h3>Classeur Zoho (.xlsx)</h3>
        <label htmlFor="import-fichier">Fichier</label>
        <input
          id="import-fichier"
          type="file"
          accept=".xlsx"
          onChange={(evenement) => setFichier(evenement.target.files?.[0] ?? null)}
        />
        <button
          type="submit"
          className="gc-btn-primary"
          disabled={fichier === null || enCours}
          aria-busy={enCours}
        >
          {enCours ? 'Import en cours…' : 'Importer'}
        </button>
      </form>

      {rapport !== null && (
        <>
          <p role="status">Import terminé</p>

          {rapport.erreurs.length > 0 && (
            <ul role="alert">
              {rapport.erreurs.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          <h3>Fusion par onglet</h3>
          <table aria-label="Fusion par onglet">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Créées</th>
                <th>Mises à jour</th>
                <th>Inchangées</th>
                <th>Ambiguïtés</th>
              </tr>
            </thead>
            <tbody>
              {rapport.parOnglet.map((onglet) => (
                <tr key={onglet.mois}>
                  <td>{onglet.mois}</td>
                  <td>{onglet.creees}</td>
                  <td>{onglet.misesAJour}</td>
                  <td>{onglet.inchangees}</td>
                  <td>{onglet.ambiguites.length}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {ambiguites.length > 0 && (
            <>
              <h3>Ambiguïtés — lignes non modifiées</h3>
              <table aria-label="Ambiguïtés">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Client</th>
                    <th>Raison</th>
                    <th>Lignes fichier</th>
                    <th>Lignes base</th>
                  </tr>
                </thead>
                <tbody>
                  {ambiguites.map((ambiguite, index) => (
                    <tr key={`${ambiguite.mois}-${ambiguite.client}-${index}`}>
                      <td>{ambiguite.mois}</td>
                      <td>{ambiguite.client}</td>
                      <td>{ambiguite.raison}</td>
                      <td>{ambiguite.lignesFichier.join(', ')}</td>
                      <td>{ambiguite.lignesBase.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {horsListe.length > 0 && (
            <>
              <h3>Valeurs hors liste</h3>
              <ul>
                {horsListe.map((valeur) => (
                  <li key={valeur}>{valeur}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
