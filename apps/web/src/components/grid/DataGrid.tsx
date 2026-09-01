'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellClassParams,
  type CellClickedEvent,
  type CellContextMenuEvent,
  type CellFocusedEvent,
  type CellKeyDownEvent,
  type CellValueChangedEvent,
  type ColDef,
  type ColumnMovedEvent,
  type ColumnResizedEvent,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
  type RowClassParams,
  type RowDragEndEvent,
} from 'ag-grid-community';
import type { CellValue, RowDTO, RowEventDTO } from '@suivi/shared';
import * as api from '../../lib/api';
import { fusionnerDisposition, useAppStore } from '../../lib/store';
import { buildColumnDefs } from './columnDefs';
import { applyCellEdit, commitHighlight, messageForError } from './cellCommit';
import {
  debounce,
  debouncePerKey,
  persistColumnField,
  persistColumnOrder,
  type PersistColumnFieldDeps,
} from './columnLayout';
import { copyFocusedCell, pasteFocusedColumn } from './clipboard';
import { RowContextMenu } from './RowContextMenu';
import { RowDeleteDialog } from './RowDeleteDialog';
import { supprimerLigne } from './rowDelete';
import { RowHistoryPanel } from './RowHistoryPanel';
import { useCoedition } from './useCoedition';
import './coedition.css';

// AG Grid v33+ : les modules Community doivent être enregistrés explicitement.
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Thème quartz personnalisé, aux tokens du template GC (voir globals.css).
 * Seul le CHROME de la grille est concerné : les pastilles de statut et le
 * surlignage manuel gardent leurs couleurs métier, appliquées par colonne.
 *
 * Les valeurs sont lues dans les variables CSS pour rester alignées sur la
 * source unique de tokens ; le repli couvre le rendu avant hydratation.
 */
export const suiviTheme = themeQuartz.withParams({
  accentColor: 'var(--gc-accent, #F09048)',
  backgroundColor: 'var(--gc-surface, #FFFFFF)',
  foregroundColor: 'var(--gc-petrol-soft, #33474A)',
  borderColor: 'var(--gc-border, #E4EAE8)',
  headerBackgroundColor: 'var(--gc-surface-alt, #F1F5F3)',
  headerTextColor: 'var(--gc-muted-soft, #8FA09C)',
  headerFontWeight: 700,
  headerFontSize: 10.5,
  // Zébrage un cran au-dessus du blanc, survol DISTINCT du zébrage (sinon le
  // hover est invisible une ligne sur deux) et halo de colonne translucide :
  // le croisement des deux guide l'œil jusqu'aux cellules en bas à droite.
  oddRowBackgroundColor: 'var(--gc-surface-alt, #F1F5F3)',
  // Traits verticaux entre colonnes (repère spreadsheet demandé par les ADV) —
  // même bordure que le chrome : assez visible sur le zébrage et le blanc.
  columnBorder: { style: 'solid', width: 1, color: 'var(--gc-border, #E4EAE8)' },
  rowHoverColor: 'var(--gc-row-hover, #E7F1EE)',
  columnHoverColor: 'var(--gc-col-hover, rgba(16, 53, 59, 0.05))',
  selectedRowBackgroundColor: 'var(--gc-surface-sunken, #E9EFED)',
  // La virgule évite qu'AG Grid ne cite la valeur comme un nom de police.
  fontFamily: 'var(--gc-font), sans-serif',
  fontSize: 13,
  rowHeight: 32,
  headerHeight: 34,
  cellHorizontalPadding: 10,
});

// --- Ligne active (spec « Filtres multi-sélection… », §3) -------------------
//
// La ligne dont une cellule a le focus (clic ou flèches clavier) porte la
// classe `.gc-row-active` (fond léger, voir globals.css).
//
// Mécanique retenue : `rowClassRules` comme source de vérité déclarative —
// AG Grid réévalue la règle à CHAQUE (re)création d'une ligne (virtualisation,
// tri, filtre…), la classe suit donc la ligne sans comptabilité — et, pour la
// transition immédiate ancienne → nouvelle ligne, bascule directe de la classe
// sur les éléments `.ag-row[row-id]` : la mécanique même qu'AG Grid emploie en
// interne pour le survol (`ag-row-hover` est posé/retiré par classList). Coût :
// deux opérations DOM, aucune reconstruction de ligne.
//
// `redrawRows` ciblé sur l'ancienne et la nouvelle ligne (l'alternative
// canonique) a été écarté après lecture du source d'ag-grid-community 34.3.1 :
// 1. tout redraw, même partiel, stoppe d'abord TOUTE édition en cours
//    (rowRenderer.redrawRows → editSvc.stopEditing) ;
// 2. déclenché depuis cellFocused — donc pendant le mousedown — il détruirait
//    la cellule cliquée avant le click/dblclick : suivi Maj+clic
//    (onCellClicked) et édition au double-clic cassés ;
// 3. le chemin partiel ne restaure pas le focus navigateur
//    (restoreFocusedCell n'est appelé que par le redraw complet) : après un
//    clic, les flèches ne piloteraient plus la grille.

/** Classe CSS de la ligne active (fond `--gc-row-active`, globals.css). */
export const CLASSE_LIGNE_ACTIVE = 'gc-row-active';

/** Transition à opérer quand la ligne au focus change. */
export interface ChangementLigneActive {
  /** Ligne qui perd la classe (null si aucune ligne n'était active). */
  retirerDe: string | null;
  /** Ligne qui reçoit la classe (null quand le focus quitte la grille). */
  poserSur: string | null;
}

/**
 * Calcule la transition de ligne active, ou null si rien ne change (même
 * ligne : les déplacements de cellule en cellule dans une ligne, ou les
 * cellFocused répétés d'AG Grid, ne touchent pas au DOM).
 */
export function changementLigneActive(
  ancienne: string | null,
  nouvelle: string | null,
): ChangementLigneActive | null {
  if (ancienne === nouvelle) {
    return null;
  }
  return { retirerDe: ancienne, poserSur: nouvelle };
}

/**
 * Applique une transition au DOM : la classe est retirée de l'ancienne ligne
 * et posée sur la nouvelle, sur TOUS ses fragments — AG Grid rend une ligne
 * en plusieurs éléments `[row-id]` (conteneur central, colonnes épinglées).
 */
export function appliquerLigneActive(
  racine: ParentNode,
  changement: ChangementLigneActive,
): void {
  const basculer = (rowId: string | null, poser: boolean) => {
    if (rowId === null) {
      return;
    }
    for (const element of racine.querySelectorAll(`.ag-row[row-id="${CSS.escape(rowId)}"]`)) {
      element.classList.toggle(CLASSE_LIGNE_ACTIVE, poser);
    }
  };
  basculer(changement.retirerDe, false);
  basculer(changement.poserSur, true);
}

/**
 * Règles de classes de lignes branchées sur `rowClassRules` : `ligneActive`
 * est résolue à l'appel (ref), jamais figée dans la closure. Typage en
 * `Record` de prédicats (comme `cellClassRules` de la co-édition) : plus
 * précis que `RowClassRules`, qui admet aussi des expressions en chaîne.
 */
export function reglesLigneActive(
  ligneActive: () => string | null,
): Record<string, (params: RowClassParams<RowDTO>) => boolean> {
  return {
    [CLASSE_LIGNE_ACTIVE]: (params: RowClassParams<RowDTO>) =>
      params.data !== undefined && params.data.id === ligneActive(),
  };
}

interface MenuState {
  row: RowDTO;
  colKey: string;
  x: number;
  y: number;
}

export interface DataGridProps {
  /** Rechargement complet de la vue courante (mois ou archives). */
  reload: () => Promise<void>;
}

export function DataGrid({ reload }: DataGridProps) {
  const columns = useAppStore((state) => state.columns);
  const userLayout = useAppStore((state) => state.userLayout);
  const choicesByColumnKey = useAppStore((state) => state.choicesByColumnKey);
  const rows = useAppStore((state) => state.rows);
  const months = useAppStore((state) => state.months);
  const toast = useAppStore((state) => state.toast);
  const view = useAppStore((state) => state.view);
  const monthCourant = useAppStore((state) => state.monthCourant);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [ligneASupprimer, setLigneASupprimer] = useState<RowDTO | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [events, setEvents] = useState<RowEventDTO[]>([]);
  // État (pas juste une ref) : la co-édition a besoin d'être notifiée du
  // GridApi dès qu'il existe, pour pouvoir rafraîchir les cellules et
  // interrompre une édition refusée.
  const [gridApi, setGridApi] = useState<GridApi<RowDTO> | null>(null);

  const coedition = useCoedition(view, monthCourant, gridApi);

  // La grille consomme les colonnes EFFECTIVES : réglage standard fusionné
  // avec la disposition personnelle (largeur, ordre, masquage). L'écran admin
  // Paramètres > Colonnes, lui, continue de lire le réglage standard pur.
  const colonnesEffectives = useMemo(
    () => fusionnerDisposition(columns, userLayout),
    [columns, userLayout],
  );

  const columnDefs = useMemo(() => {
    const base = buildColumnDefs(colonnesEffectives, choicesByColumnKey);
    // La Feature 6 fixe déjà `editable: true` et un `cellStyle` (surlignage
    // manuel) sur CHAQUE colDef : en AG Grid, ces propriétés de colDef
    // l'emportent toujours sur celles de `defaultColDef`, quelle que soit
    // leur valeur. Sans cette composition, `defaultColDef.editable` et
    // `defaultColDef.cellStyle` (ci-dessous) ne seraient donc jamais
    // consultés et la co-édition n'aurait aucun effet visuel ni de verrou.
    return base.map((def: ColDef<RowDTO>) => {
      const baseCellStyle = def.cellStyle;
      return {
        ...def,
        editable: coedition.isCellEditable,
        cellStyle: (params: CellClassParams<RowDTO>) => {
          const own =
            typeof baseCellStyle === 'function' ? (baseCellStyle(params) ?? {}) : (baseCellStyle ?? {});
          return { ...own, ...(coedition.cellStyle(params) ?? {}) };
        },
      };
    });
  }, [colonnesEffectives, choicesByColumnKey, coedition.isCellEditable, coedition.cellStyle]);

  const defaultColDef = useMemo(
    () => ({
      resizable: true,
      sortable: false,
      editable: coedition.isCellEditable,
      cellClassRules: coedition.cellClassRules,
      cellStyle: coedition.cellStyle,
    }),
    [coedition.isCellEditable, coedition.cellClassRules, coedition.cellStyle],
  );

  const deps = useMemo(
    () => ({
      patchRow: api.patchRow,
      applyRowPatch: useAppStore.getState().applyRowPatch,
      reload,
      showToast: useAppStore.getState().showToast,
    }),
    [reload],
  );

  // Sélection verticale suivie à la main (la sélection de plage est Enterprise) :
  // clic simple = 1 cellule ; Maj+clic dans la MÊME colonne = étend depuis l'ancre.
  const selectionRef = useRef<{ colKey: string; anchor: number; indexes: number[] }>({
    colKey: '',
    anchor: -1,
    indexes: [],
  });

  // --- Ligne active (voir le bloc de doc en tête de fichier) ---------------
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const ligneActiveRef = useRef<string | null>(null);

  const rowClassRules = useMemo(() => reglesLigneActive(() => ligneActiveRef.current), []);

  const changerLigneActive = useCallback((nouvelle: string | null) => {
    const changement = changementLigneActive(ligneActiveRef.current, nouvelle);
    if (!changement) {
      return;
    }
    ligneActiveRef.current = nouvelle;
    if (conteneurRef.current) {
      appliquerLigneActive(conteneurRef.current, changement);
    }
  }, []);

  const onCellFocused = useCallback(
    (event: CellFocusedEvent<RowDTO>) => {
      // L'événement porte rowIndex, PAS l'id de ligne : résolution AVANT le
      // traitement co-édition, pour lire l'index sur un ordre de lignes
      // encore stable (la vue n'épingle aucune ligne, l'index affiché suffit).
      const node =
        event.rowIndex === null || event.rowIndex === undefined
          ? undefined
          : event.api.getDisplayedRowAtIndex(event.rowIndex);
      coedition.onCellFocused(event);
      changerLigneActive(node?.data?.id ?? null);
    },
    [coedition.onCellFocused, changerLigneActive],
  );

  // Le focus quitte la grille (onBlur React = focusout, qui bulle) : la
  // surbrillance disparaît. `relatedTarget` encore DANS le conteneur (éditeur
  // ouvert, menu contextuel, dialogues) : elle reste.
  const onConteneurBlur = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      changerLigneActive(null);
    },
    [changerLigneActive],
  );

  const onGridReady = useCallback((event: GridReadyEvent<RowDTO>) => {
    setGridApi(event.api);
    // Filtres PERSONNELS (client) : la barre du bas déclenche la remise à
    // zéro sans connaître le GridApi — le store porte le branchement.
    useAppStore.getState().setClearFilters(() => event.api.setFilterModel(null));
  }, []);

  // Compteur X / N : X depuis la grille (lignes affichées après filtres),
  // N depuis le store. Rafraîchi sur filtre ET sur mutation du modèle
  // (upsertRow de la co-édition, ajout/suppression de lignes…).
  const syncFilterStatus = useCallback((event: { api: GridApi<RowDTO> }) => {
    useAppStore
      .getState()
      .setFilterStatus(event.api.getDisplayedRowCount(), event.api.isAnyFilterPresent());
  }, []);

  useEffect(
    () => () => {
      const store = useAppStore.getState();
      store.setClearFilters(null);
      store.setFilterStatus(0, false);
    },
    [],
  );

  const onCellClicked = useCallback((event: CellClickedEvent<RowDTO>) => {
    const colKey = event.column.getColId();
    const rowIndex = event.rowIndex ?? 0;
    const mouse = event.event as MouseEvent | null;
    const current = selectionRef.current;
    if (mouse?.shiftKey && current.colKey === colKey && current.anchor >= 0) {
      const lo = Math.min(current.anchor, rowIndex);
      const hi = Math.max(current.anchor, rowIndex);
      const indexes: number[] = [];
      for (let i = lo; i <= hi; i += 1) indexes.push(i);
      selectionRef.current = { colKey, anchor: current.anchor, indexes };
    } else {
      selectionRef.current = { colKey, anchor: rowIndex, indexes: [rowIndex] };
    }
  }, []);

  const onCellKeyDown = useCallback(
    (event: CellKeyDownEvent<RowDTO>) => {
      const keyboard = event.event as KeyboardEvent | null;
      if (!keyboard || !(keyboard.ctrlKey || keyboard.metaKey)) return;
      const key = keyboard.key.toLowerCase();
      if (key === 'c') {
        keyboard.preventDefault();
        void copyFocusedCell(event.api, (text) => navigator.clipboard.writeText(text), deps);
      } else if (key === 'v') {
        keyboard.preventDefault();
        const colKey = event.api.getFocusedCell()?.column.getColId() ?? '';
        const indexes = selectionRef.current.colKey === colKey ? selectionRef.current.indexes : [];
        void pasteFocusedColumn(event.api, columns, () => navigator.clipboard.readText(), indexes, deps);
      }
    },
    [columns, deps],
  );

  // --- Toast : disparition automatique après 6 s ---------------------------
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useAppStore.getState().hideToast(), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Persistance de la largeur et de l'ordre des colonnes (PERSO) --------
  // Depuis la spec « Disposition des colonnes par utilisateur », le resize et
  // le déplacement écrivent la disposition PERSONNELLE (PATCH
  // /me/column-layout/:columnId), plus jamais la config globale.
  //
  // Initialisation paresseuse : `useRef(<expr>).current` évaluerait <expr> à
  // CHAQUE rendu (l'objet/la closure construit(e) serait aussitôt jetée,
  // seul `.current` du premier rendu étant conservé) ; on n'initialise donc
  // qu'au premier accès, via `useRef<T | null>(null)` + garde.

  // Dépendances partagées par les deux persisteurs : résolues à l'appel (via
  // `getState()`) pour ne jamais fermer sur un état de store obsolète.
  const layoutDepsRef = useRef<PersistColumnFieldDeps | null>(null);
  if (!layoutDepsRef.current) {
    layoutDepsRef.current = {
      getColumns: () => useAppStore.getState().columns,
      patchMyColumnLayout: api.patchMyColumnLayout,
      applyUserLayoutEntries: (entries) =>
        useAppStore.getState().applyUserLayoutEntries(entries),
      onError: (error) => useAppStore.getState().showToast(messageForError(error), 'error'),
    };
  }
  const layoutDeps = layoutDepsRef.current;

  // Coalescence PAR COLONNE (`colKey`) : redimensionner la colonne A puis la
  // colonne B dans la même fenêtre de 400 ms produit un PATCH par colonne —
  // un debounce global ferait perdre silencieusement celui de A.
  type ColumnFieldDebouncer = ReturnType<typeof debouncePerKey<[string, number]>>;

  const persistWidthRef = useRef<ColumnFieldDebouncer | null>(null);
  if (!persistWidthRef.current) {
    persistWidthRef.current = debouncePerKey(
      (colKey: string, width: number) => {
        void persistColumnField(colKey, { width }, layoutDeps);
      },
      400,
      (colKey: string) => colKey,
    );
  }
  const persistWidth = persistWidthRef.current;

  // Un déplacement enregistre l'ordre COMPLET des colonnes affichées (une
  // entrée position par colonne) : un debounce GLOBAL suffit ici, la
  // dernière rafale porte l'ordre final — contrairement aux largeurs, il
  // n'y a rien à coalescer par colonne.
  const persistOrderRef = useRef<ReturnType<typeof debounce<[string[]]>> | null>(null);
  if (!persistOrderRef.current) {
    persistOrderRef.current = debounce((ordre: string[]) => {
      void persistColumnOrder(ordre, layoutDeps);
    }, 400);
  }
  const persistOrder = persistOrderRef.current;

  useEffect(() => () => {
    persistWidth.cancelAll();
    persistOrder.cancel();
  }, [persistWidth, persistOrder]);

  // Garde sur `event.source` (uiColumnResized/uiColumnMoved = geste
  // utilisateur) : un recalcul de `columnDefs` (config.changed admin,
  // ré-application du layout perso) déclenche les mêmes événements avec une
  // autre source — les persister matérialiserait en réglage perso des
  // valeurs que l'utilisateur n'a jamais choisies.
  const onColumnResized = useCallback(
    (event: ColumnResizedEvent<RowDTO>) => {
      if (!event.finished || !event.column || event.source !== 'uiColumnResized') return;
      persistWidth(event.column.getColId(), Math.round(event.column.getActualWidth()));
    },
    [persistWidth],
  );

  const onColumnMoved = useCallback(
    (event: ColumnMovedEvent<RowDTO>) => {
      if (!event.finished || event.source !== 'uiColumnMoved') return;
      persistOrder(event.api.getAllDisplayedColumns().map((column) => column.getColId()));
    },
    [persistOrder],
  );

  // --- Édition d'une cellule ------------------------------------------------
  // Rollback fin par clé (Feature 7) : `applyCellEdit` gère lui-même
  // l'optimisme, la confirmation serveur et le rollback ciblé sur 409/erreur,
  // sans recharger tout le mois (voir cellCommit.ts).
  const flashCell = useCallback(
    (rowId: string, colKey: string) => {
      const node = gridApi?.getRowNode(rowId);
      if (node) {
        gridApi?.flashCells({ rowNodes: [node], columns: [colKey] });
      }
    },
    [gridApi],
  );

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<RowDTO, CellValue>) => {
      const rowId = (event.data as RowDTO).id;
      const colKey = event.column.getColId();
      // `event.oldValue` est capturé par AG Grid AVANT l'appel au
      // `valueSetter` de la colonne, qui mute `Row.data[colKey]` en place sur
      // l'objet du store (voir columnDefs.ts). On le transmet explicitement
      // à `applyCellEdit` : c'est la seule valeur "avant édition" encore
      // fiable à ce stade, indispensable pour un rollback correct en cas
      // d'échec du PATCH (voir cellCommit.ts, `CellEditDeps.previousValue`).
      void applyCellEdit(rowId, colKey, event.newValue as CellValue, {
        flashCell,
        previousValue: (event.oldValue ?? null) as CellValue,
      });
    },
    [flashCell],
  );

  // --- Réordonnancement par glisser-déposer --------------------------------
  const onRowDragEnd = useCallback(
    (event: RowDragEndEvent<RowDTO>) => {
      const row = event.node.data;
      if (!row) return;
      void api
        .moveRow(row.id, { position: event.overIndex })
        .then(() => reload())
        .catch((error: unknown) => {
          useAppStore.getState().showToast(messageForError(error), 'error');
          return reload();
        });
    },
    [reload],
  );

  // --- Menu contextuel ------------------------------------------------------
  const onCellContextMenu = useCallback((event: CellContextMenuEvent<RowDTO>) => {
    const mouse = event.event as MouseEvent | null;
    if (!event.data || !mouse) return;
    setMenu({
      row: event.data,
      colKey: event.column.getColId(),
      x: mouse.clientX,
      y: mouse.clientY,
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await reload();
      } catch (error: unknown) {
        useAppStore.getState().showToast(messageForError(error), 'error');
        await reload();
      }
    },
    [reload],
  );

  async function openHistory(row: RowDTO): Promise<void> {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      setEvents(await api.getRowEvents(row.id));
    } catch (error: unknown) {
      useAppStore.getState().showToast(messageForError(error), 'error');
      setEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div
      ref={conteneurRef}
      data-testid="data-grid"
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}
      onClick={() => setMenu(null)}
      onBlur={onConteneurBlur}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <AgGridReact<RowDTO>
          theme={suiviTheme}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(params: GetRowIdParams<RowDTO>) => params.data.id}
          defaultColDef={defaultColDef}
          rowClassRules={rowClassRules}
          singleClickEdit={false}
          columnHoverHighlight={true}
          stopEditingWhenCellsLoseFocus
          rowDragManaged
          preventDefaultOnContextMenu
          animateRows={false}
          enableCellTextSelection={true}
          ensureDomOrder={true}
          onGridReady={onGridReady}
          onFilterChanged={syncFilterStatus}
          onModelUpdated={syncFilterStatus}
          onCellValueChanged={onCellValueChanged}
          onColumnResized={onColumnResized}
          onColumnMoved={onColumnMoved}
          onRowDragEnd={onRowDragEnd}
          onCellClicked={onCellClicked}
          onCellKeyDown={onCellKeyDown}
          onCellFocused={onCellFocused}
          onCellEditingStarted={coedition.onCellEditingStarted}
          onCellEditingStopped={coedition.onCellEditingStopped}
          onCellContextMenu={onCellContextMenu}
        />
      </div>

      {menu ? (
        <RowContextMenu
          row={menu.row}
          colKey={menu.colKey}
          months={months}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onInsertAbove={() =>
            void runAction(() =>
              api.createRow({ month: menu.row.month, position: menu.row.position }),
            )
          }
          onInsertBelow={() =>
            void runAction(() =>
              api.createRow({ month: menu.row.month, position: menu.row.position + 1 }),
            )
          }
          onMoveToMonth={(month) =>
            void runAction(() => api.moveRow(menu.row.id, { month }))
          }
          onToggleArchive={() =>
            void runAction(() => api.archiveRow(menu.row.id, !menu.row.archived))
          }
          onDelete={() => setLigneASupprimer(menu.row)}
          onShowHistory={() => void openHistory(menu.row)}
          onHighlight={(color) =>
            void commitHighlight(menu.row, menu.colKey, color, deps)
          }
        />
      ) : null}

      {ligneASupprimer ? (
        <RowDeleteDialog
          row={ligneASupprimer}
          onCancel={() => setLigneASupprimer(null)}
          onConfirm={() => {
            const rowId = ligneASupprimer.id;
            setLigneASupprimer(null);
            void supprimerLigne(rowId, {
              deleteRow: api.deleteRow,
              removeRow: useAppStore.getState().removeRow,
              reload,
              showToast: useAppStore.getState().showToast,
            });
          }}
        />
      ) : null}

      {historyOpen ? (
        <RowHistoryPanel
          events={events}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {toast ? (
        <div
          data-testid="toast"
          role="status"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 1200,
            maxWidth: 420,
            padding: '11px 16px',
            borderRadius: 'var(--gc-radius)',
            color: 'var(--gc-on-petrol)',
            background: toast.kind === 'error' ? 'var(--gc-danger)' : 'var(--gc-petrol)',
            boxShadow: 'var(--gc-shadow-lg)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
