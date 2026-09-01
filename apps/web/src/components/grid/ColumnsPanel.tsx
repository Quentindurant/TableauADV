'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDTO } from '@suivi/shared';
import * as api from '../../lib/api';
import { indexerDisposition, useAppStore, type UserLayout } from '../../lib/store';
import { messageForError } from './cellCommit';

/** Ligne du panneau : une colonne visible GLOBALEMENT, cochée si affichée. */
export interface LigneColonnePanneau {
  id: string;
  label: string;
  /** false = masquée PERSO (la case est décochée, la colonne reste listée). */
  affichee: boolean;
}

/**
 * Colonnes proposées au masquage personnel : les colonnes visibles
 * globalement, triées par position perso sinon standard — une colonne masquée
 * PERSO garde ainsi sa place dans la liste, celle où elle réapparaîtra en la
 * recochant (la fusion de la grille, elle, l'exclut : inutilisable ici). Les
 * colonnes invisibles globalement (réglage admin) n'apparaissent pas — les
 * ré-afficher relève de Paramètres > Colonnes, pas d'une préférence
 * personnelle.
 */
export function lignesPanneauColonnes(
  columns: ColumnDTO[],
  userLayout: UserLayout,
): LigneColonnePanneau[] {
  return columns
    .filter((column) => column.visible)
    .sort((gauche, droite) => {
      const persoGauche = userLayout[gauche.id]?.position;
      const persoDroite = userLayout[droite.id]?.position;
      return (
        // Position perso sinon standard ; à égalité, la perso EXPLICITE passe
        // devant la standard héritée, puis départage stable par la standard.
        (persoGauche ?? gauche.position) - (persoDroite ?? droite.position) ||
        Number(persoDroite !== undefined) - Number(persoGauche !== undefined) ||
        gauche.position - droite.position
      );
    })
    .map((column) => ({
      id: column.id,
      label: column.label,
      affichee: !(userLayout[column.id]?.hidden ?? false),
    }));
}

/**
 * Bouton « Colonnes » de la barre de statut + panneau d'affichage/masquage
 * personnel des colonnes. Même mécanique de panneau que le menu des mois
 * (MonthNav) : rendu en portail `document.body`, ancré en `fixed` au-dessus
 * du bouton (l'`overflow-x` de la barre rognerait un panneau absolu), fermé
 * au clic extérieur, à Échap et dès que la fenêtre bouge.
 */
export function ColumnsPanel() {
  const columns = useAppStore((state) => state.columns);
  const userLayout = useAppStore((state) => state.userLayout);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const lignes = lignesPanneauColonnes(columns, userLayout);

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent): void {
      const target = event.target as Node;
      // Le panneau vit dans un portail : un clic dedans est hors du wrap.
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    // Panneau en position fixe : on le referme dès que la fenêtre bouge.
    function onWindowChange(): void {
      setOpen(false);
    }
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onWindowChange);
    window.addEventListener('resize', onWindowChange);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onWindowChange);
      window.removeEventListener('resize', onWindowChange);
    };
  }, [open]);

  function togglePanel(): void {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPosition({ left: rect.left, bottom: window.innerHeight - rect.top + 6 });
    setOpen(true);
  }

  /** Décocher = masquer pour SOI seulement (PATCH perso, jamais le global). */
  async function basculerColonne(columnId: string, affichee: boolean): Promise<void> {
    try {
      const entry = await api.patchMyColumnLayout(columnId, { hidden: !affichee });
      useAppStore.getState().applyUserLayoutEntries([entry]);
    } catch (error: unknown) {
      useAppStore.getState().showToast(messageForError(error), 'error');
    }
  }

  /**
   * DELETE de toutes les entrées perso. Le store est vidé dès que le DELETE
   * a réussi — sans attendre le rechargement de contrôle : si ce GET échoue,
   * l'affichage reste conforme à l'état serveur (vide) au lieu de garder
   * l'ancienne disposition. La grille se rafraîchit d'elle-même, `columnDefs`
   * dérivant de la fusion.
   */
  async function reinitialiser(): Promise<void> {
    setBusy(true);
    try {
      await api.resetMyColumnLayout();
    } catch (error: unknown) {
      useAppStore.getState().showToast(messageForError(error), 'error');
      setBusy(false);
      return;
    }
    useAppStore.getState().setUserLayout({});
    try {
      const layout = await api.getMyColumnLayout();
      useAppStore.getState().setUserLayout(indexerDisposition(layout));
    } catch {
      // Rechargement de contrôle seulement : l'état vide est déjà correct.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="gc-monthnav__wrap">
      <button
        type="button"
        data-testid="columns-panel-toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={togglePanel}
        className="gc-tab gc-monthnav__reset"
      >
        Colonnes
      </button>

      {open && panelPosition
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Colonnes affichées"
              data-testid="columns-panel"
              className="gc-monthnav__menu gc-colonnes__menu"
              style={{ left: panelPosition.left, bottom: panelPosition.bottom }}
            >
              {lignes.map((ligne) => (
                <label key={ligne.id} className="gc-colonnes__option">
                  <input
                    type="checkbox"
                    data-testid={`column-visible-${ligne.id}`}
                    checked={ligne.affichee}
                    onChange={(event) =>
                      void basculerColonne(ligne.id, event.target.checked)
                    }
                  />
                  {ligne.label}
                </label>
              ))}
              <button
                type="button"
                data-testid="columns-layout-reset"
                disabled={busy}
                onClick={() => void reinitialiser()}
                className="gc-tab gc-monthnav__reset gc-colonnes__reset"
              >
                Réinitialiser la disposition
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
