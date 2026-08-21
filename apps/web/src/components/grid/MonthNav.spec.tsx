import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthInfo } from '@suivi/shared';
import {
  MonthNav,
  adjacentMonth,
  formatMonthLabel,
  latestMonth,
  nextMonth,
} from './MonthNav';

const months: MonthInfo[] = [
  { month: '2026-06', count: 30 },
  { month: '2026-08', count: 17 },
  { month: '2026-07', count: 42 },
];

function renderNav(overrides: Partial<Parameters<typeof MonthNav>[0]> = {}) {
  const props = {
    months,
    current: '2026-07',
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onOpenArchives: vi.fn(),
    ...overrides,
  };
  render(<MonthNav {...props} />);
  return props;
}

describe('helpers de mois', () => {
  it("nextMonth passe au mois suivant et change d'année en décembre", () => {
    expect(nextMonth('2026-08')).toBe('2026-09');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('latestMonth rend le mois le plus récent, ou le mois courant si la liste est vide', () => {
    expect(latestMonth(months)).toBe('2026-08');
    expect(latestMonth([], new Date('2026-03-15T12:00:00Z'))).toBe('2026-03');
  });

  it('formatMonthLabel rend le libellé des onglets Excel', () => {
    expect(formatMonthLabel('2026-08')).toBe('AOUT 2026');
    expect(formatMonthLabel('2027-01')).toBe('JANVIER 2027');
  });

  it('adjacentMonth navigue dans les mois existants, relativement au mois affiché', () => {
    expect(adjacentMonth(months, '2026-07', -1)).toBe('2026-06');
    expect(adjacentMonth(months, '2026-07', 1)).toBe('2026-08');
  });

  it('adjacentMonth saute les trous de la liste (mois manquants)', () => {
    const avecTrou: MonthInfo[] = [
      { month: '2026-05', count: 1 },
      { month: '2026-09', count: 3 },
      { month: '2026-07', count: 2 },
    ];
    expect(adjacentMonth(avecTrou, '2026-07', 1)).toBe('2026-09');
    expect(adjacentMonth(avecTrou, '2026-07', -1)).toBe('2026-05');
    expect(adjacentMonth(avecTrou, '2026-09', -1)).toBe('2026-07');
  });

  it('adjacentMonth rend null aux extrémités ou pour un mois inconnu', () => {
    expect(adjacentMonth(months, '2026-06', -1)).toBeNull();
    expect(adjacentMonth(months, '2026-08', 1)).toBeNull();
    expect(adjacentMonth(months, '2025-01', 1)).toBeNull();
    expect(adjacentMonth([], '2026-07', -1)).toBeNull();
  });
});

describe('MonthNav', () => {
  it('affiche le mois courant en pilule, avec son compteur, sans menu ouvert', () => {
    renderNav();
    const pill = screen.getByTestId('month-current');
    expect(pill.textContent).toContain('JUILLET 2026');
    expect(pill.textContent).toContain('42');
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('month-menu')).toBeNull();
  });

  it('les flèches naviguent vers les mois existants voisins du mois affiché', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNav();
    await user.click(screen.getByTestId('month-prev'));
    expect(onSelect).toHaveBeenCalledWith('2026-06');
    await user.click(screen.getByTestId('month-next'));
    expect(onSelect).toHaveBeenCalledWith('2026-08');
  });

  it('désactive la flèche sans mois voisin', () => {
    renderNav({ current: '2026-08' });
    expect((screen.getByTestId('month-next') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('month-prev') as HTMLButtonElement).disabled).toBe(false);
  });

  it('la pilule déroule tous les mois, du plus récent au plus ancien', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByTestId('month-current'));
    expect(screen.getByTestId('month-menu')).toBeTruthy();
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.getAttribute('data-testid'))).toEqual([
      'month-option-2026-08',
      'month-option-2026-07',
      'month-option-2026-06',
    ]);
    expect(screen.getByTestId('month-option-2026-07').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByTestId('month-option-2026-06').textContent).toContain('JUIN 2026');
    expect(screen.getByTestId('month-option-2026-06').textContent).toContain('30');
  });

  it('choisir un mois dans le menu le sélectionne et referme le menu', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNav();
    await user.click(screen.getByTestId('month-current'));
    await user.click(screen.getByTestId('month-option-2026-06'));
    expect(onSelect).toHaveBeenCalledWith('2026-06');
    expect(screen.queryByTestId('month-menu')).toBeNull();
  });

  it('Échap et un clic hors du menu referment le menu sans sélection', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderNav();
    await user.click(screen.getByTestId('month-current'));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('month-menu')).toBeNull();
    await user.click(screen.getByTestId('month-current'));
    await user.click(document.body);
    expect(screen.queryByTestId('month-menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('le bouton + demande la création du mois suivant le plus récent', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderNav();
    await user.click(screen.getByTestId('month-add'));
    expect(onCreate).toHaveBeenCalledWith('2026-09');
  });

  it('donne accès aux archives', async () => {
    const user = userEvent.setup();
    const { onOpenArchives } = renderNav();
    await user.click(screen.getByTestId('month-archives'));
    expect(onOpenArchives).toHaveBeenCalledTimes(1);
  });

  it('rend les éléments enfants dans la barre (emplacement du compteur)', () => {
    render(
      <MonthNav
        months={months}
        current="2026-07"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onOpenArchives={vi.fn()}
      >
        <span data-testid="slot-compteur" />
      </MonthNav>,
    );
    expect(screen.getByTestId('slot-compteur')).toBeTruthy();
  });
});
