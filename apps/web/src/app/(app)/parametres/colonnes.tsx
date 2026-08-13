'use client';

import type { ColumnDTO, ColumnType } from '@suivi/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiFetch } from '../../../lib/api';
import { messageErreurApi } from './messages';

export const TYPES_COLONNE: { valeur: ColumnType; libelle: string }[] = [
  { valeur: 'TEXT', libelle: 'Texte' },
  { valeur: 'LONGTEXT', libelle: 'Texte long' },
  { valeur: 'DATE', libelle: 'Date' },
  { valeur: 'TIME', libelle: 'Heure' },
  { valeur: 'NUMBER', libelle: 'Nombre' },
  { valeur: 'SELECT', libelle: 'Liste' },
  { valeur: 'LINK', libelle: 'Lien' },
];

export function trierParPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export default function ColonnesTab() {
  const [colonnes, setColonnes] = useState<ColumnDTO[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [nouveauLabel, setNouveauLabel] = useState('');
  const [nouveauType, setNouveauType] = useState<ColumnType>('TEXT');

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    try {
      const donnees = await apiFetch<ColumnDTO[]>('/columns');
      setColonnes(trierParPosition(donnees));
      setErreur(null);
    } catch (err) {
      setErreur(messageErreurApi(err));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const changerType = async (id: string, type: ColumnType): Promise<void> => {
    try {
      const misAJour = await apiFetch<ColumnDTO>(`/columns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ type }),
      });
      setColonnes((precedentes) =>
        trierParPosition(precedentes.map((c) => (c.id === misAJour.id ? misAJour : c))),
      );
      setErreur(null);
      // Le changement de type ne convertit jamais les valeurs déjà saisies.
      setAvertissement('Les valeurs existantes ne sont pas converties.');
    } catch (err) {
      setErreur(messageErreurApi(err));
    }
  };

  const ajouter = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
    evenement.preventDefault();
    const label = nouveauLabel.trim();
    if (label === '') {
      setErreur('Le libellé de la colonne est obligatoire.');
      return;
    }
    try {
      const creee = await apiFetch<ColumnDTO>('/columns', {
        method: 'POST',
        body: JSON.stringify({ label, type: nouveauType }),
      });
      setColonnes((precedentes) => trierParPosition([...precedentes, creee]));
      setNouveauLabel('');
      setNouveauType('TEXT');
      setErreur(null);
    } catch (err) {
      setErreur(messageErreurApi(err));
    }
  };

  return (
    <section aria-label="Colonnes">
      {erreur !== null && <p role="alert">{erreur}</p>}
      {avertissement !== null && <p role="status">{avertissement}</p>}
      {chargement && <p>Chargement des colonnes…</p>}

      <table>
        <caption>Colonnes du tableau</caption>
        <thead>
          <tr>
            <th scope="col">Libellé</th>
            <th scope="col">Type</th>
            <th scope="col">Visible</th>
            <th scope="col">Largeur (px)</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {colonnes.map((colonne) => (
            <tr key={colonne.id} data-testid={`colonne-${colonne.key}`}>
              <td>{colonne.label}</td>
              <td>
                <select
                  aria-label={`Type de la colonne ${colonne.label}`}
                  value={colonne.type}
                  onChange={(evenement) => {
                    void changerType(colonne.id, evenement.target.value as ColumnType);
                  }}
                >
                  {TYPES_COLONNE.map((type) => (
                    <option key={type.valeur} value={type.valeur}>
                      {type.libelle}
                    </option>
                  ))}
                </select>
              </td>
              <td>{colonne.visible ? 'Oui' : 'Non'}</td>
              <td>{colonne.width}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Le type d’une colonne est modifiable à tout moment. Attention : l’API ne convertit pas
        les valeurs déjà saisies — elles sont conservées telles quelles et réinterprétées par le
        nouveau type.
      </p>

      <form
        onSubmit={(evenement) => {
          void ajouter(evenement);
        }}
      >
        <h3>Ajouter une colonne</h3>
        <label htmlFor="nouvelle-colonne-label">Libellé</label>
        <input
          id="nouvelle-colonne-label"
          value={nouveauLabel}
          onChange={(evenement) => setNouveauLabel(evenement.target.value)}
        />
        <label htmlFor="nouvelle-colonne-type">Type</label>
        <select
          id="nouvelle-colonne-type"
          value={nouveauType}
          onChange={(evenement) => setNouveauType(evenement.target.value as ColumnType)}
        >
          {TYPES_COLONNE.map((type) => (
            <option key={type.valeur} value={type.valeur}>
              {type.libelle}
            </option>
          ))}
        </select>
        <button type="submit">Ajouter la colonne</button>
      </form>
    </section>
  );
}
