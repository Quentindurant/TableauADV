import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDTO } from '@suivi/shared';
import { debounce, resolveColumnId } from './columnLayout';

const columns: ColumnDTO[] = [
  {
    id: 'col-client',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 0,
    width: 220,
    visible: true,
    choices: [],
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('n’appelle la fonction qu’une fois, après le délai, avec les derniers arguments', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 400);
    debounced('client', 200);
    debounced('client', 240);
    vi.advanceTimersByTime(399);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('client', 240);
  });

  it('cancel annule l’appel en attente', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 400);
    debounced('client', 200);
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('resolveColumnId', () => {
  it('retrouve l’identifiant de colonne depuis sa clé', () => {
    expect(resolveColumnId(columns, 'client')).toBe('col-client');
  });

  it('rend null pour une clé inconnue, vide ou absente', () => {
    expect(resolveColumnId(columns, 'inconnue')).toBeNull();
    expect(resolveColumnId(columns, null)).toBeNull();
    expect(resolveColumnId(columns, undefined)).toBeNull();
  });
});
