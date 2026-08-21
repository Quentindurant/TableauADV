import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './store';

describe('filtres personnels de la grille (store)', () => {
  beforeEach(() => {
    useAppStore.setState({ displayedRowCount: 0, filtersActive: false });
    useAppStore.getState().setClearFilters(null);
  });

  it("part sans filtre actif et avec une remise à zéro inoffensive", () => {
    expect(useAppStore.getState().displayedRowCount).toBe(0);
    expect(useAppStore.getState().filtersActive).toBe(false);
    expect(() => useAppStore.getState().clearFilters()).not.toThrow();
  });

  it('setFilterStatus mémorise le nombre de lignes affichées et l’état des filtres', () => {
    useAppStore.getState().setFilterStatus(12, true);
    expect(useAppStore.getState().displayedRowCount).toBe(12);
    expect(useAppStore.getState().filtersActive).toBe(true);

    useAppStore.getState().setFilterStatus(42, false);
    expect(useAppStore.getState().displayedRowCount).toBe(42);
    expect(useAppStore.getState().filtersActive).toBe(false);
  });

  it('setClearFilters branche la remise à zéro de la grille, null la débranche', () => {
    const clear = vi.fn();
    useAppStore.getState().setClearFilters(clear);
    useAppStore.getState().clearFilters();
    expect(clear).toHaveBeenCalledTimes(1);

    useAppStore.getState().setClearFilters(null);
    expect(() => useAppStore.getState().clearFilters()).not.toThrow();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
