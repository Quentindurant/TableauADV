import { describe, expect, it, vi } from 'vitest';
import { supprimerLigne, type SuppressionLigneDeps } from './rowDelete';

function fabriquerDeps(): {
  deps: SuppressionLigneDeps;
  mocks: {
    deleteRow: ReturnType<typeof vi.fn>;
    removeRow: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
  };
} {
  const mocks = {
    deleteRow: vi.fn().mockResolvedValue(undefined),
    removeRow: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
  };
  return { deps: mocks, mocks };
}

describe('supprimerLigne — flux confirmé de suppression', () => {
  it('retire la ligne du store puis appelle DELETE /rows/:id', async () => {
    const { deps, mocks } = fabriquerDeps();
    const ordre: string[] = [];
    mocks.removeRow.mockImplementation(() => ordre.push('removeRow'));
    mocks.deleteRow.mockImplementation(() => {
      ordre.push('deleteRow');
      return Promise.resolve();
    });

    await supprimerLigne('row-1', deps);

    expect(mocks.removeRow).toHaveBeenCalledWith('row-1');
    expect(mocks.deleteRow).toHaveBeenCalledWith('row-1');
    expect(ordre).toEqual(['removeRow', 'deleteRow']);
  });

  it('en succès : ni toast, ni rechargement (le temps réel confirme le retrait)', async () => {
    const { deps, mocks } = fabriquerDeps();

    await supprimerLigne('row-1', deps);

    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('sur refus de l’API : toast d’erreur et rechargement qui restaure la ligne', async () => {
    const { deps, mocks } = fabriquerDeps();
    mocks.deleteRow.mockRejectedValueOnce(new Error('réseau'));

    await supprimerLigne('row-1', deps);

    expect(mocks.removeRow).toHaveBeenCalledWith('row-1');
    expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
