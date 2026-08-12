import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthInfo } from '@suivi/shared';
import {
  MonthTabs,
  formatMonthLabel,
  latestMonth,
  nextMonth,
} from './MonthTabs';

const months: MonthInfo[] = [
  { month: '2026-07', count: 42 },
  { month: '2026-08', count: 17 },
];

describe('helpers de mois', () => {
  it('nextMonth passe au mois suivant et change d\'année en décembre', () => {
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
});

describe('MonthTabs', () => {
  it('affiche un onglet par mois avec son compteur et marque le mois actif', () => {
    render(
      <MonthTabs
        months={months}
        current="2026-08"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onOpenArchives={vi.fn()}
      />,
    );
    expect(screen.getByTestId('month-tab-2026-07').textContent).toContain('JUILLET 2026');
    expect(screen.getByTestId('month-tab-2026-07').textContent).toContain('42');
    expect(screen.getByTestId('month-tab-2026-08').getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByTestId('month-tab-2026-07').getAttribute('aria-current')).toBeNull();
  });

  it('remonte le mois sélectionné', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MonthTabs
        months={months}
        current="2026-08"
        onSelect={onSelect}
        onCreate={vi.fn()}
        onOpenArchives={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('month-tab-2026-07'));
    expect(onSelect).toHaveBeenCalledWith('2026-07');
  });

  it('le bouton + demande la création du mois suivant le plus récent', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <MonthTabs
        months={months}
        current="2026-07"
        onSelect={vi.fn()}
        onCreate={onCreate}
        onOpenArchives={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('month-add'));
    expect(onCreate).toHaveBeenCalledWith('2026-09');
  });

  it('donne accès aux archives', async () => {
    const user = userEvent.setup();
    const onOpenArchives = vi.fn();
    render(
      <MonthTabs
        months={months}
        current="2026-08"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onOpenArchives={onOpenArchives}
      />,
    );
    await user.click(screen.getByTestId('month-archives'));
    expect(onOpenArchives).toHaveBeenCalledTimes(1);
  });
});
