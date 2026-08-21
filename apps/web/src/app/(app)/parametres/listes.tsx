'use client';

import type { ChoiceDTO, ColumnDTO } from '@suivi/shared';
import { useCallback, useEffect, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';

import { apiFetch } from '../../../lib/api';
import { deplacerElement, trierParPosition } from './colonnes';
import { aCodeErreur, messageErreurApi } from './messages';

export const FOND_DEFAUT = '#ffffff';
export const TEXTE_DEFAUT = '#000000';

/** `input[type=color]` n'accepte qu'un hex 7 caractères en minuscules. */
export function hexPourInput(hex: string | null, defaut: string): string {
  if (hex === null || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return defaut;
  }
  return hex.toLowerCase();
}

export function stylePastille(
  choix: Pick<ChoiceDTO, 'bgColor' | 'textColor' | 'bold'>,
): CSSProperties {
  return {
    backgroundColor: choix.bgColor ?? 'transparent',
    color: choix.textColor ?? 'inherit',
    fontWeight: choix.bold ? 700 : 400,
    display: 'inline-block',
    padding: '2px 10px',
    // Forme et contour = CHROME du template ; le fond et le texte de la
    // pastille restent les couleurs MÉTIER du choix.
    borderRadius: 'var(--gc-radius-pill)',
    border: '1px solid var(--gc-border)',
  };
}

interface EtatSuppressionChoix {
  choix: ChoiceDTO;
  messageBlocage: string | null;
}

/** Clé de la colonne des techniciens terrain : gérée dans son propre onglet. */
export const CLE_TECHNICIENS = 'nom_tech';

/** Identités stables (défauts hors rendu) pour ne pas relancer `charger` à chaque rendu. */
const AUCUNE_CLE: readonly string[] = [];
const CLES_EXCLUES_LISTES: readonly string[] = [CLE_TECHNICIENS];

export interface ProprietesGestionChoix {
  /** Colonne unique à gérer : masque le sélecteur de colonnes. */
  cleFixe?: string;
  /** Clés retirées du sélecteur générique (référentiels à foyer dédié). */
  clesExclues?: readonly string[];
  ariaSection?: string;
  titreAjout?: string;
  libelleNouvelleValeur?: string;
  boutonAjout?: string;
}

export function GestionChoix({
  cleFixe,
  clesExclues = AUCUNE_CLE,
  ariaSection = 'Listes et couleurs',
  titreAjout = 'Ajouter une valeur',
  libelleNouvelleValeur = 'Nouvelle valeur',
  boutonAjout = 'Ajouter la valeur',
}: ProprietesGestionChoix) {
  const [colonnes, setColonnes] = useState<ColumnDTO[]>([]);
  const [colonneId, setColonneId] = useState('');
  const [choix, setChoix] = useState<ChoiceDTO[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [nouveauLabel, setNouveauLabel] = useState('');
  const [nouveauFond, setNouveauFond] = useState(FOND_DEFAUT);
  const [nouveauTexte, setNouveauTexte] = useState(TEXTE_DEFAUT);
  const [nouveauGras, setNouveauGras] = useState(false);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editionLabel, setEditionLabel] = useState('');
  const [indexGlisse, setIndexGlisse] = useState<number | null>(null);
  const [suppression, setSuppression] = useState<EtatSuppressionChoix | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    try {
      const toutes = await apiFetch<ColumnDTO[]>('/columns');
      const listes = trierParPosition(
        toutes.filter(
          (colonne) =>
            colonne.type === 'SELECT' &&
            (cleFixe === undefined ? !clesExclues.includes(colonne.key) : colonne.key === cleFixe),
        ),
      );
      setColonnes(listes);
      setColonneId((precedent) =>
        listes.some((colonne) => colonne.id === precedent) ? precedent : (listes[0]?.id ?? ''),
      );
      setErreur(null);
    } catch (err) {
      setErreur(messageErreurApi(err));
    } finally {
      setChargement(false);
    }
  }, [cleFixe, clesExclues]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    const courante = colonnes.find((colonne) => colonne.id === colonneId);
    setChoix(courante === undefined ? [] : trierParPosition(courante.choices));
  }, [colonnes, colonneId]);

  /** Aperçu immédiat, avant tout aller-retour réseau. */
  const majLocale = (id: string, modification: Partial<ChoiceDTO>): void => {
    setChoix((precedents) =>
      precedents.map((element) => (element.id === id ? { ...element, ...modification } : element)),
    );
  };

  const enregistrerChoix = async (
    id: string,
    corps: Partial<Pick<ChoiceDTO, 'label' | 'bgColor' | 'textColor' | 'bold' | 'position' | 'archived'>>,
  ): Promise<ChoiceDTO | null> => {
    try {
      const misAJour = await apiFetch<ChoiceDTO>(`/choices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(corps),
      });
      setColonnes((precedentes) =>
        precedentes.map((colonne) =>
          colonne.id === misAJour.columnId
            ? {
                ...colonne,
                choices: colonne.choices.map((element) =>
                  element.id === misAJour.id ? misAJour : element,
                ),
              }
            : colonne,
        ),
      );
      setErreur(null);
      return misAJour;
    } catch (err) {
      setErreur(messageErreurApi(err));
      await charger();
      return null;
    }
  };

  const ajouterValeur = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
    evenement.preventDefault();
    const label = nouveauLabel.trim();
    if (label === '') {
      setErreur('Le libellé de la valeur est obligatoire.');
      return;
    }
    if (colonneId === '') {
      setErreur('Sélectionnez d’abord une colonne de type liste.');
      return;
    }
    try {
      const cree = await apiFetch<ChoiceDTO>(`/columns/${colonneId}/choices`, {
        method: 'POST',
        body: JSON.stringify({
          label,
          bgColor: nouveauFond,
          textColor: nouveauTexte,
          bold: nouveauGras,
        }),
      });
      setColonnes((precedentes) =>
        precedentes.map((colonne) =>
          colonne.id === colonneId ? { ...colonne, choices: [...colonne.choices, cree] } : colonne,
        ),
      );
      setNouveauLabel('');
      setNouveauFond(FOND_DEFAUT);
      setNouveauTexte(TEXTE_DEFAUT);
      setNouveauGras(false);
      setErreur(null);
      setInfo(null);
    } catch (err) {
      setErreur(messageErreurApi(err));
    }
  };

  const demarrerEdition = (element: ChoiceDTO): void => {
    setEditionId(element.id);
    setEditionLabel(element.label);
    setInfo(null);
  };

  const annulerEdition = (): void => {
    setEditionId(null);
    setEditionLabel('');
  };

  const validerEdition = async (element: ChoiceDTO): Promise<void> => {
    const label = editionLabel.trim();
    annulerEdition();
    if (label === '' || label === element.label) {
      return;
    }
    const misAJour = await enregistrerChoix(element.id, { label });
    if (misAJour !== null) {
      setInfo('Renommage propagé aux lignes existantes.');
    }
  };

  const basculerArchivage = async (element: ChoiceDTO): Promise<void> => {
    await enregistrerChoix(element.id, { archived: !element.archived });
  };

  const commencerGlisse = (index: number) => (evenement: DragEvent<HTMLLIElement>): void => {
    setIndexGlisse(index);
    evenement.dataTransfer.effectAllowed = 'move';
    evenement.dataTransfer.setData('text/plain', String(index));
  };

  const survolerGlisse = (evenement: DragEvent<HTMLLIElement>): void => {
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = 'move';
  };

  const deposer = (index: number) => async (evenement: DragEvent<HTMLLIElement>): Promise<void> => {
    evenement.preventDefault();
    const depuis = indexGlisse ?? Number.parseInt(evenement.dataTransfer.getData('text/plain'), 10);
    setIndexGlisse(null);
    if (Number.isNaN(depuis) || depuis === index) {
      return;
    }
    const reordonnes = deplacerElement(choix, depuis, index);
    setChoix(reordonnes.map((element, rang) => ({ ...element, position: rang })));
    await enregistrerChoix(reordonnes[index].id, { position: index });
  };

  const confirmerSuppression = async (): Promise<void> => {
    if (suppression === null) {
      return;
    }
    const cible = suppression.choix;
    try {
      await apiFetch<void>(`/choices/${cible.id}`, { method: 'DELETE' });
      setColonnes((precedentes) =>
        precedentes.map((colonne) =>
          colonne.id === cible.columnId
            ? { ...colonne, choices: colonne.choices.filter((element) => element.id !== cible.id) }
            : colonne,
        ),
      );
      setSuppression(null);
      setErreur(null);
    } catch (err) {
      if (aCodeErreur(err, 'CHOICE_IN_USE')) {
        setSuppression({ choix: cible, messageBlocage: messageErreurApi(err) });
        return;
      }
      setErreur(messageErreurApi(err));
      setSuppression(null);
    }
  };

  const archiverAuLieuDeSupprimer = async (): Promise<void> => {
    if (suppression === null) {
      return;
    }
    await enregistrerChoix(suppression.choix.id, { archived: true });
    setSuppression(null);
  };

  return (
    <section aria-label={ariaSection}>
      {erreur !== null && <p role="alert">{erreur}</p>}
      {info !== null && <p role="status">{info}</p>}
      {chargement && <p>Chargement des listes…</p>}

      {cleFixe === undefined && (
        <>
          <label htmlFor="selecteur-colonne">Colonne de type liste</label>
          <select
            id="selecteur-colonne"
            value={colonneId}
            onChange={(evenement) => {
              setColonneId(evenement.target.value);
              setInfo(null);
            }}
          >
            {colonnes.map((colonne) => (
              <option key={colonne.id} value={colonne.id}>
                {colonne.label}
              </option>
            ))}
          </select>
        </>
      )}

      <ul>
        {choix.map((element, index) => (
          <li
            key={element.id}
            data-testid={`choix-${element.id}`}
            draggable
            onDragStart={commencerGlisse(index)}
            onDragOver={survolerGlisse}
            onDrop={(evenement) => {
              void deposer(index)(evenement);
            }}
            onDragEnd={() => setIndexGlisse(null)}
          >
            <span aria-hidden="true" title="Glisser pour réordonner">
              ⠿
            </span>
            <span data-testid={`pastille-${element.id}`} style={stylePastille(element)}>
              {element.label}
            </span>

            {editionId === element.id ? (
              <>
                <input
                  aria-label={`Nouveau libellé de ${element.label}`}
                  value={editionLabel}
                  autoFocus
                  onChange={(evenement) => setEditionLabel(evenement.target.value)}
                  onKeyDown={(evenement) => {
                    if (evenement.key === 'Enter') {
                      evenement.preventDefault();
                      void validerEdition(element);
                    }
                    if (evenement.key === 'Escape') {
                      evenement.preventDefault();
                      annulerEdition();
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={`Valider le libellé de ${element.label}`}
                  onClick={() => {
                    void validerEdition(element);
                  }}
                >
                  ✓
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-label={`Renommer le choix ${element.label}`}
                onClick={() => demarrerEdition(element)}
              >
                Renommer
              </button>
            )}

            <input
              type="color"
              aria-label={`Couleur de fond de ${element.label}`}
              value={hexPourInput(element.bgColor, FOND_DEFAUT)}
              onChange={(evenement) => majLocale(element.id, { bgColor: evenement.target.value })}
              onBlur={() => {
                void enregistrerChoix(element.id, { bgColor: element.bgColor });
              }}
            />
            <input
              type="color"
              aria-label={`Couleur du texte de ${element.label}`}
              value={hexPourInput(element.textColor, TEXTE_DEFAUT)}
              onChange={(evenement) => majLocale(element.id, { textColor: evenement.target.value })}
              onBlur={() => {
                void enregistrerChoix(element.id, { textColor: element.textColor });
              }}
            />
            <label>
              <input
                type="checkbox"
                aria-label={`Gras pour ${element.label}`}
                checked={element.bold}
                onChange={(evenement) => {
                  const gras = evenement.target.checked;
                  majLocale(element.id, { bold: gras });
                  void enregistrerChoix(element.id, { bold: gras });
                }}
              />
              Gras
            </label>

            <button
              type="button"
              aria-label={`${element.archived ? 'Désarchiver' : 'Archiver'} ${element.label}`}
              onClick={() => {
                void basculerArchivage(element);
              }}
            >
              {element.archived ? 'Désarchiver' : 'Archiver'}
            </button>
            <button
              type="button"
              aria-label={`Supprimer ${element.label}`}
              onClick={() => setSuppression({ choix: element, messageBlocage: null })}
            >
              Supprimer
            </button>
            {element.archived && <em> (archivée)</em>}
          </li>
        ))}
      </ul>

      <form
        onSubmit={(evenement) => {
          void ajouterValeur(evenement);
        }}
      >
        <h3>{titreAjout}</h3>
        <label htmlFor="nouvelle-valeur-label">{libelleNouvelleValeur}</label>
        <input
          id="nouvelle-valeur-label"
          value={nouveauLabel}
          onChange={(evenement) => setNouveauLabel(evenement.target.value)}
        />
        <input
          type="color"
          aria-label="Couleur de fond de la nouvelle valeur"
          value={nouveauFond}
          onChange={(evenement) => setNouveauFond(evenement.target.value)}
        />
        <input
          type="color"
          aria-label="Couleur du texte de la nouvelle valeur"
          value={nouveauTexte}
          onChange={(evenement) => setNouveauTexte(evenement.target.value)}
        />
        <label>
          <input
            type="checkbox"
            aria-label="Gras pour la nouvelle valeur"
            checked={nouveauGras}
            onChange={(evenement) => setNouveauGras(evenement.target.checked)}
          />
          Gras
        </label>
        <span
          data-testid="apercu-nouvelle-valeur"
          style={stylePastille({ bgColor: nouveauFond, textColor: nouveauTexte, bold: nouveauGras })}
        >
          {nouveauLabel === '' ? 'Aperçu' : nouveauLabel}
        </span>
        <button type="submit">{boutonAjout}</button>
      </form>

      {suppression !== null && (
        <div role="dialog" aria-modal="true" aria-label="Confirmer la suppression de la valeur">
          <p>Supprimer la valeur « {suppression.choix.label} » ?</p>
          {suppression.messageBlocage === null ? (
            <p>Cette action est définitive et ne peut pas être annulée.</p>
          ) : (
            <p role="alert">{suppression.messageBlocage}</p>
          )}
          <button type="button" onClick={() => setSuppression(null)}>
            Annuler
          </button>
          {suppression.messageBlocage === null ? (
            <button
              type="button"
              onClick={() => {
                void confirmerSuppression();
              }}
            >
              Supprimer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void archiverAuLieuDeSupprimer();
              }}
            >
              Archiver à la place
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function ListesTab() {
  return <GestionChoix clesExclues={CLES_EXCLUES_LISTES} />;
}
