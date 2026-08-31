import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthReportDialog, type MonthReportDialogProps } from './MonthReportDialog';

function setup(overrides: Partial<MonthReportDialogProps> = {}) {
  const props: MonthReportDialogProps = {
    from: '2026-08',
    to: '2026-09',
    count: 17,
    onReport: vi.fn(),
    onCreateEmpty: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<MonthReportDialog {...props} />);
  return props;
}

describe('MonthReportDialog', () => {
  it('affiche un dialogue modal avec le compte et le mois source', () => {
    setup();
    const dialogue = screen.getByRole('dialog', {
      name: 'Reprendre les dossiers du mois précédent',
    });
    expect(dialogue).toHaveAttribute('aria-modal', 'true');
    expect(dialogue).toHaveTextContent('17 dossiers repris depuis AOUT 2026');
    expect(dialogue).toHaveTextContent(
      "Date d'installation en SEPTEMBRE 2026 ou sans date, hors clôturés/annulés.",
    );
  });

  it('accorde le libellé au singulier pour un seul dossier', () => {
    setup({ count: 1 });
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '1 dossier repris depuis AOUT 2026',
    );
  });

  it('ne déclenche rien tant qu’aucun bouton n’est cliqué', () => {
    const props = setup();
    expect(props.onReport).not.toHaveBeenCalled();
    expect(props.onCreateEmpty).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('« Reprendre » demande le report', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(props.onReport).toHaveBeenCalledTimes(1);
    expect(props.onCreateEmpty).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('« Créer vide » demande la création historique sans report', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Créer vide' }));
    expect(props.onCreateEmpty).toHaveBeenCalledTimes(1);
    expect(props.onReport).not.toHaveBeenCalled();
  });

  it('« Annuler » ferme sans rien créer', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onReport).not.toHaveBeenCalled();
    expect(props.onCreateEmpty).not.toHaveBeenCalled();
  });

  it('Échap annule', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.keyboard('{Escape}');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('busy désactive les trois boutons et neutralise Échap', async () => {
    const user = userEvent.setup();
    const props = setup({ busy: true });
    expect(
      (screen.getByTestId('month-report-confirm') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId('month-report-empty') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId('month-report-cancel') as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.keyboard('{Escape}');
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});
