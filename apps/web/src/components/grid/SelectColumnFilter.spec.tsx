import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChoiceDTO } from '@suivi/shared';
import {
  LIBELLE_VIDE,
  SelectColumnFilter,
  SelectColumnFloatingFilter,
  compterValeursColonne,
  normaliserRecherche,
  passeLeFiltreSelection,
  type SelectColumnFilterProps,
  type SelectColumnFloatingFilterProps,
  type SelectFilterModel,
} from './SelectColumnFilter';
import { useAppStore } from '../../lib/store';
import type { RowDTO } from '@suivi/shared';

function ligne(id: string, data: Record<string, string>): RowDTO {
  return {
    id,
    month: '2026-09',
    position: 0,
    data,
    formats: {},
    version: 0,
    archived: false,
  } as RowDTO;
}

// Le composant s'enregistre auprès de la grille via `useGridFilter` : on
// capture les callbacks fournis pour tester `doesFilterPass` hors AG Grid.
const capture = vi.hoisted(() => ({
  callbacks: {} as {
    doesFilterPass?: (params: unknown) => boolean;
    afterGuiAttached?: (params?: unknown) => void;
  },
}));

vi.mock('ag-grid-react', () => ({
  useGridFilter: (callbacks: typeof capture.callbacks) => {
    capture.callbacks = callbacks;
  },
}));

const choices: ChoiceDTO[] = [
  {
    id: 'ch-1',
    columnId: 'col-statut',
    label: 'NEW',
    bgColor: '#FFFF00',
    textColor: '#FF0000',
    bold: true,
    position: 0,
    archived: false,
  },
  {
    id: 'ch-2',
    columnId: 'col-statut',
    label: 'INSTALLATION',
    bgColor: '#9BDEB4',
    textColor: '#176638',
    bold: true,
    position: 1,
    archived: false,
  },
  {
    id: 'ch-3',
    columnId: 'col-statut',
    label: 'RÉSILIÉ',
    bgColor: '#F5B7B1',
    textColor: '#78281F',
    bold: false,
    position: 2,
    archived: false,
  },
  {
    id: 'ch-4',
    columnId: 'col-statut',
    label: 'ANCIEN STATUT',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 3,
    archived: true,
  },
];

function propsFiltre(
  model: SelectFilterModel | null,
  onModelChange: ReturnType<typeof vi.fn> = vi.fn(),
): SelectColumnFilterProps {
  return {
    model,
    onModelChange,
    onUiChange: vi.fn(),
    choices,
    colDef: { colId: 'statut' },
  } as unknown as SelectColumnFilterProps;
}

function caseACocher(testId: string): HTMLInputElement {
  return screen.getByTestId(testId) as HTMLInputElement;
}

describe('normaliserRecherche', () => {
  it('ignore la casse, les accents et les espaces de bord', () => {
    expect(normaliserRecherche('  résilié ')).toBe('RESILIE');
    expect(normaliserRecherche('Installation')).toBe('INSTALLATION');
    expect(normaliserRecherche('')).toBe('');
  });
});

describe('passeLeFiltreSelection', () => {
  it('laisse tout passer sans modèle', () => {
    expect(passeLeFiltreSelection(null, 'NEW')).toBe(true);
    expect(passeLeFiltreSelection(null, null)).toBe(true);
  });

  it('filtre sur l\'appartenance de la valeur brute aux entrées cochées', () => {
    const model: SelectFilterModel = { values: ['NEW'] };
    expect(passeLeFiltreSelection(model, 'NEW')).toBe(true);
    expect(passeLeFiltreSelection(model, 'INSTALLATION')).toBe(false);
    expect(passeLeFiltreSelection(model, null)).toBe(false);
  });

  it('l\'entrée null du modèle couvre les cellules vides', () => {
    const model: SelectFilterModel = { values: [null] };
    expect(passeLeFiltreSelection(model, null)).toBe(true);
    expect(passeLeFiltreSelection(model, undefined)).toBe(true);
    expect(passeLeFiltreSelection(model, '')).toBe(true);
    expect(passeLeFiltreSelection(model, 'NEW')).toBe(false);
  });

  it('un modèle vide ne laisse rien passer (tout décoché)', () => {
    const model: SelectFilterModel = { values: [] };
    expect(passeLeFiltreSelection(model, 'NEW')).toBe(false);
    expect(passeLeFiltreSelection(model, null)).toBe(false);
  });
});

describe('compterValeursColonne', () => {
  it('compte chaque valeur brute et regroupe les cellules vides sous null', () => {
    const comptes = compterValeursColonne(
      [
        ligne('r1', { statut: 'NEW' }),
        ligne('r2', { statut: 'NEW' }),
        ligne('r3', { statut: 'INSTALLATION' }),
        ligne('r4', { statut: '' }),
        ligne('r5', {}),
      ],
      'statut',
    );
    expect(comptes.get('NEW')).toBe(2);
    expect(comptes.get('INSTALLATION')).toBe(1);
    expect(comptes.get(null)).toBe(2);
  });

  it('affiche le nombre de lignes à côté de chaque choix et de (Vide)', () => {
    useAppStore.setState({
      rows: [
        ligne('r1', { statut: 'NEW' }),
        ligne('r2', { statut: 'NEW' }),
        ligne('r3', {}),
      ],
    });
    render(<SelectColumnFilter {...propsFiltre(null)} />);
    expect(screen.getByTestId('filtre-compte-NEW').textContent).toBe('2');
    expect(screen.getByTestId('filtre-compte-INSTALLATION').textContent).toBe('0');
    expect(screen.getByTestId('filtre-compte-vide').textContent).toBe('1');
    useAppStore.setState({ rows: [] });
  });
});

describe('SelectColumnFilter', () => {
  it('liste les choix non archivés en pastilles, plus l\'entrée (Vide)', () => {
    render(<SelectColumnFilter {...propsFiltre(null)} />);
    expect(screen.getByTestId('filtre-choix-NEW')).toBeDefined();
    expect(screen.getByTestId('filtre-choix-INSTALLATION')).toBeDefined();
    expect(screen.getByTestId('filtre-choix-RÉSILIÉ')).toBeDefined();
    expect(screen.getByTestId('filtre-choix-vide')).toBeDefined();
    expect(screen.queryByTestId('filtre-choix-ANCIEN STATUT')).toBeNull();
    // Les pastilles gardent les couleurs métier du choix.
    expect(screen.getByText('NEW').style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(screen.getByText(LIBELLE_VIDE)).toBeDefined();
  });

  it('sans modèle, tout est coché (état neutre)', () => {
    render(<SelectColumnFilter {...propsFiltre(null)} />);
    expect(caseACocher('filtre-choix-NEW').checked).toBe(true);
    expect(caseACocher('filtre-choix-INSTALLATION').checked).toBe(true);
    expect(caseACocher('filtre-choix-vide').checked).toBe(true);
  });

  it('décocher un choix produit un modèle avec les entrées restantes', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(<SelectColumnFilter {...propsFiltre(null, onModelChange)} />);
    await user.click(screen.getByTestId('filtre-choix-NEW'));
    expect(onModelChange).toHaveBeenCalledWith({
      values: ['INSTALLATION', 'RÉSILIÉ', null],
    });
  });

  it('recocher la dernière entrée manquante repasse le modèle à null', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(
      <SelectColumnFilter
        {...propsFiltre({ values: ['INSTALLATION', 'RÉSILIÉ', null] }, onModelChange)}
      />,
    );
    await user.click(screen.getByTestId('filtre-choix-NEW'));
    // Tout coché = pas de filtre.
    expect(onModelChange).toHaveBeenCalledWith(null);
  });

  it('décocher (Vide) exclut les cellules vides du modèle', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(<SelectColumnFilter {...propsFiltre(null, onModelChange)} />);
    await user.click(screen.getByTestId('filtre-choix-vide'));
    expect(onModelChange).toHaveBeenCalledWith({
      values: ['NEW', 'INSTALLATION', 'RÉSILIÉ'],
    });
  });

  it('recherche insensible à la casse et aux accents', async () => {
    const user = userEvent.setup();
    render(<SelectColumnFilter {...propsFiltre(null)} />);
    await user.type(screen.getByTestId('filtre-selection-recherche'), 'resil');
    expect(screen.getByTestId('filtre-choix-RÉSILIÉ')).toBeDefined();
    expect(screen.queryByTestId('filtre-choix-NEW')).toBeNull();
    expect(screen.queryByTestId('filtre-choix-vide')).toBeNull();
  });

  it('« Tout décocher » vide la sélection, « Tout cocher » lève le filtre', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(<SelectColumnFilter {...propsFiltre({ values: ['NEW'] }, onModelChange)} />);
    await user.click(screen.getByTestId('filtre-selection-tout-decocher'));
    expect(onModelChange).toHaveBeenCalledWith({ values: [] });
    await user.click(screen.getByTestId('filtre-selection-tout-cocher'));
    expect(onModelChange).toHaveBeenCalledWith(null);
  });

  it('le modèle pilote les cases : get/set standard, Réinitialiser inclus', () => {
    const view = render(<SelectColumnFilter {...propsFiltre({ values: ['NEW'] })} />);
    expect(caseACocher('filtre-choix-NEW').checked).toBe(true);
    expect(caseACocher('filtre-choix-INSTALLATION').checked).toBe(false);
    expect(caseACocher('filtre-choix-vide').checked).toBe(false);
    // `setFilterModel(null)` (bouton « Réinitialiser ») → modèle null → tout coché.
    view.rerender(<SelectColumnFilter {...propsFiltre(null)} />);
    expect(caseACocher('filtre-choix-NEW').checked).toBe(true);
    expect(caseACocher('filtre-choix-INSTALLATION').checked).toBe(true);
    expect(caseACocher('filtre-choix-vide').checked).toBe(true);
  });

  it('doesFilterPass juge la valeur brute de data[colKey]', () => {
    render(<SelectColumnFilter {...propsFiltre({ values: ['NEW'] })} />);
    const passe = (statut: unknown) =>
      capture.callbacks.doesFilterPass?.({ node: {}, data: { data: { statut } } });
    expect(passe('NEW')).toBe(true);
    expect(passe('INSTALLATION')).toBe(false);
    expect(passe(null)).toBe(false);
  });

  it('doesFilterPass accepte les cellules vides quand (Vide) est coché', () => {
    render(<SelectColumnFilter {...propsFiltre({ values: [null] })} />);
    const passe = (statut: unknown) =>
      capture.callbacks.doesFilterPass?.({ node: {}, data: { data: { statut } } });
    expect(passe(null)).toBe(true);
    expect(passe('')).toBe(true);
    expect(passe('NEW')).toBe(false);
  });

  it('doesFilterPass laisse tout passer sans modèle', () => {
    render(<SelectColumnFilter {...propsFiltre(null)} />);
    const passe = (statut: unknown) =>
      capture.callbacks.doesFilterPass?.({ node: {}, data: { data: { statut } } });
    expect(passe('NEW')).toBe(true);
    expect(passe(null)).toBe(true);
  });

  it('met le focus sur la recherche à l\'ouverture du panneau', () => {
    render(<SelectColumnFilter {...propsFiltre(null)} />);
    capture.callbacks.afterGuiAttached?.();
    expect(document.activeElement).toBe(screen.getByTestId('filtre-selection-recherche'));
  });
});

describe('SelectColumnFloatingFilter', () => {
  function propsFlottant(
    model: SelectFilterModel | null,
    showParentFilter: ReturnType<typeof vi.fn> = vi.fn(),
  ): SelectColumnFloatingFilterProps {
    return {
      model,
      showParentFilter,
      onModelChange: vi.fn(),
    } as unknown as SelectColumnFloatingFilterProps;
  }

  it('affiche « Tous » sans filtre actif', () => {
    render(<SelectColumnFloatingFilter {...propsFlottant(null)} />);
    expect(screen.getByTestId('filtre-flottant-selection').textContent).toBe('Tous');
  });

  it('affiche le nombre d\'entrées sélectionnées, (Vide) comprise', () => {
    const single = render(<SelectColumnFloatingFilter {...propsFlottant({ values: ['NEW'] })} />);
    expect(screen.getByTestId('filtre-flottant-selection').textContent).toBe('1 sélectionné');
    single.unmount();
    render(<SelectColumnFloatingFilter {...propsFlottant({ values: ['NEW', null] })} />);
    expect(screen.getByTestId('filtre-flottant-selection').textContent).toBe('2 sélectionnés');
  });

  it('ouvre le panneau du filtre parent au clic', async () => {
    const user = userEvent.setup();
    const showParentFilter = vi.fn();
    render(<SelectColumnFloatingFilter {...propsFlottant(null, showParentFilter)} />);
    await user.click(screen.getByTestId('filtre-flottant-selection'));
    expect(showParentFilter).toHaveBeenCalledTimes(1);
  });
});
