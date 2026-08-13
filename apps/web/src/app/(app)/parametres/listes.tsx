'use client';

import type { ChoiceDTO, ColumnDTO } from '@suivi/shared';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import { apiFetch } from '../../../lib/api';
import { trierParPosition } from './colonnes';
import { messageErreurApi } from './messages';

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
    borderRadius: '10px',
    border: '1px solid rgba(0, 0, 0, 0.15)',
  };
}

export default function ListesTab() {
  const [colonnes, setColonnes] = useState<ColumnDTO[]>([]);
  const [colonneId, setColonneId] = useState('');
  const [choix, setChoix] = useState<ChoiceDTO[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    try {
      const toutes = await apiFetch<ColumnDTO[]>('/columns');
      const listes = trierParPosition(toutes.filter((colonne) => colonne.type === 'SELECT'));
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
  }, []);

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

  return (
    <section aria-label="Listes et couleurs">
      {erreur !== null && <p role="alert">{erreur}</p>}
      {info !== null && <p role="status">{info}</p>}
      {chargement && <p>Chargement des listes…</p>}

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

      <ul>
        {choix.map((element) => (
          <li key={element.id} data-testid={`choix-${element.id}`}>
            <span data-testid={`pastille-${element.id}`} style={stylePastille(element)}>
              {element.label}
            </span>
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
            {element.archived && <em> (archivée)</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}
