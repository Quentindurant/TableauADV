import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChoiceDTO } from '@suivi/shared';
import { SelectCellRenderer } from './SelectCellRenderer';

const choices: ChoiceDTO[] = [
  {
    id: 'ch-1',
    columnId: 'col-statut',
    label: 'INSTALLATION',
    bgColor: '#9BDEB4',
    textColor: '#176638',
    bold: true,
    position: 0,
    archived: false,
  },
  {
    id: 'ch-2',
    columnId: 'col-statut',
    label: 'A DISTANCE',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 1,
    archived: false,
  },
];

describe('SelectCellRenderer', () => {
  it('affiche une pastille aux couleurs du choix', () => {
    render(<SelectCellRenderer value="INSTALLATION" choices={choices} />);
    const pastille = screen.getByTestId('select-pastille');
    expect(pastille.textContent).toBe('INSTALLATION');
    expect(pastille.style.backgroundColor).toBe('rgb(155, 222, 180)');
    expect(pastille.style.color).toBe('rgb(23, 102, 56)');
    expect(pastille.style.fontWeight).toBe('700');
  });

  it('reste neutre pour un choix sans couleur', () => {
    render(<SelectCellRenderer value="A DISTANCE" choices={choices} />);
    const pastille = screen.getByTestId('select-pastille');
    expect(pastille.style.backgroundColor).toBe('');
    expect(pastille.style.fontWeight).toBe('400');
  });

  it('affiche telle quelle une valeur hors liste (import Excel)', () => {
    render(<SelectCellRenderer value="ATT CLIENTT" choices={choices} />);
    expect(screen.getByTestId('select-pastille').textContent).toBe('ATT CLIENTT');
  });

  it("n'affiche rien pour une cellule vide", () => {
    const { container } = render(<SelectCellRenderer value={null} choices={choices} />);
    expect(container.querySelector('[data-testid="select-pastille"]')).toBeNull();
  });
});
