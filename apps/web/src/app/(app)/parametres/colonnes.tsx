'use client';

import type { ColumnDTO, ColumnType } from '@suivi/shared';
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';

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

export function deplacerElement<T>(items: readonly T[], depuis: number, vers: number): T[] {
  const copie = [...items];
  if (depuis < 0 || depuis >= copie.length || vers < 0 || vers >= copie.length) {
    return copie;
  }
  const [element] = copie.splice(depuis, 1);
  copie.splice(vers, 0, element);
  return copie;
}

export default function ColonnesTab() {
  const [colonnes, setColonnes] = useState<ColumnDTO[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [nouveauLabel, setNouveauLabel] = useState('');
  const [nouveauType, setNouveauType] = useState<ColumnType>('TEXT');
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editionLabel, setEditionLabel] = useState('');
  const [indexGlisse, setIndexGlisse] = useState<number | null>(null);

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

  const patchColonne = useCallback(
    async (
      id: string,
      corps: Partial<Pick<ColumnDTO, 'label' | 'position' | 'width' | 'visible'>>,
    ): Promise<void> => {
      try {
        const misAJour = await apiFetch<ColumnDTO>(`/columns/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(corps),
        });
        setColonnes((precedentes) =>
          trierParPosition(precedentes.map((c) => (c.id === misAJour.id ? misAJour : c))),
        );
        setErreur(null);
      } catch (err) {
        // charger() rechargent la liste réinitialise l'erreur à null en cas de succès :
        // on affiche donc le message après le rechargement pour qu'il ne soit pas effacé.
        await charger();
        setErreur(messageErreurApi(err));
      }
    },
    [charger],
  );

  const demarrerEdition = (colonne: ColumnDTO): void => {
    setEditionId(colonne.id);
    setEditionLabel(colonne.label);
  };

  const annulerEdition = (): void => {
    setEditionId(null);
    setEditionLabel('');
  };

  const validerEdition = async (colonne: ColumnDTO): Promise<void> => {
    const label = editionLabel.trim();
    annulerEdition();
    if (label === '' || label === colonne.label) {
      return;
    }
    await patchColonne(colonne.id, { label });
  };

  const changerLargeur = (id: string, saisie: string): void => {
    const largeur = Number.parseInt(saisie, 10);
    setColonnes((precedentes) =>
      precedentes.map((c) => (c.id === id ? { ...c, width: Number.isNaN(largeur) ? 0 : largeur } : c)),
    );
  };

  const validerLargeur = async (colonne: ColumnDTO): Promise<void> => {
    if (colonne.width < 40 || colonne.width > 1000) {
      setErreur('La largeur doit être comprise entre 40 et 1000 pixels.');
      return;
    }
    await patchColonne(colonne.id, { width: colonne.width });
  };

  const basculerVisible = async (colonne: ColumnDTO, visible: boolean): Promise<void> => {
    setColonnes((precedentes) =>
      precedentes.map((c) => (c.id === colonne.id ? { ...c, visible } : c)),
    );
    await patchColonne(colonne.id, { visible });
  };

  const commencerGlisse = (index: number) => (evenement: DragEvent<HTMLTableRowElement>): void => {
    setIndexGlisse(index);
    evenement.dataTransfer.effectAllowed = 'move';
    evenement.dataTransfer.setData('text/plain', String(index));
  };

  const survolerGlisse = (evenement: DragEvent<HTMLTableRowElement>): void => {
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = 'move';
  };

  const deposer = (index: number) => async (
    evenement: DragEvent<HTMLTableRowElement>,
  ): Promise<void> => {
    evenement.preventDefault();
    const brut = evenement.dataTransfer.getData('text/plain');
    const depuis = indexGlisse ?? Number.parseInt(brut, 10);
    setIndexGlisse(null);
    if (Number.isNaN(depuis) || depuis === index) {
      return;
    }
    const reordonnees = deplacerElement(colonnes, depuis, index).map((colonne, rang) => ({
      ...colonne,
      position: rang,
    }));
    setColonnes(reordonnees);
    await patchColonne(reordonnees[index].id, { position: index });
    await charger();
  };

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
            <th scope="col">
              <span className="sr-only">Ordre</span>
            </th>
            <th scope="col">Libellé</th>
            <th scope="col">Type</th>
            <th scope="col">Visible</th>
            <th scope="col">Largeur (px)</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {colonnes.map((colonne) => (
            <tr
              key={colonne.id}
              data-testid={`colonne-${colonne.key}`}
              draggable
              onDragStart={commencerGlisse(colonnes.indexOf(colonne))}
              onDragOver={survolerGlisse}
              onDrop={(evenement) => {
                void deposer(colonnes.indexOf(colonne))(evenement);
              }}
              onDragEnd={() => setIndexGlisse(null)}
            >
              <td aria-hidden="true" title="Glisser pour réordonner">
                ⠿
              </td>
              <td>
                {editionId === colonne.id ? (
                  <>
                    <input
                      aria-label={`Nouveau libellé de ${colonne.label}`}
                      value={editionLabel}
                      autoFocus
                      onChange={(evenement) => setEditionLabel(evenement.target.value)}
                      onKeyDown={(evenement) => {
                        if (evenement.key === 'Enter') {
                          evenement.preventDefault();
                          void validerEdition(colonne);
                        }
                        if (evenement.key === 'Escape') {
                          evenement.preventDefault();
                          annulerEdition();
                        }
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Valider le libellé de ${colonne.label}`}
                      onClick={() => {
                        void validerEdition(colonne);
                      }}
                    >
                      ✓
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={`Renommer ${colonne.label}`}
                    onClick={() => demarrerEdition(colonne)}
                  >
                    {colonne.label}
                  </button>
                )}
              </td>
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
              <td>
                <input
                  type="checkbox"
                  aria-label={`Colonne ${colonne.label} visible`}
                  checked={colonne.visible}
                  onChange={(evenement) => {
                    void basculerVisible(colonne, evenement.target.checked);
                  }}
                />
              </td>
              <td>
                <input
                  type="number"
                  aria-label={`Largeur de ${colonne.label}`}
                  value={String(colonne.width)}
                  min={40}
                  max={1000}
                  onChange={(evenement) => changerLargeur(colonne.id, evenement.target.value)}
                  onBlur={() => {
                    void validerLargeur(colonne);
                  }}
                />
              </td>
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
