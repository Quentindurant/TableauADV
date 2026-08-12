import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserDTO } from '@suivi/shared';
import { useAppStore } from '../../lib/store';
import { ConnectionBanner, CONNECTION_LOST_MESSAGE } from './ConnectionBanner';
import { PresenceBar } from './PresenceBar';

const me: UserDTO = { id: 'me', email: 'me@test.fr', displayName: 'Moi Même', cursorColor: '#123456' };
const bob: UserDTO = { id: 'bob', email: 'bob@test.fr', displayName: 'Bob Dupont', cursorColor: '#00FF00' };
const zoe: UserDTO = { id: 'zoe', email: 'zoe@test.fr', displayName: 'Zoé', cursorColor: '#FF00FF' };

beforeEach(() => {
  useAppStore.setState({
    user: me,
    users: [me, bob, zoe],
    columns: [],
    rows: [],
    view: 'month',
    monthCourant: '2026-08',
    connected: true,
    presence: [],
    focuses: {},
    locks: {},
    toast: null,
  });
});

describe('PresenceBar', () => {
  it("affiche un avatar par collègue avec ses initiales, sa couleur et son nom en infobulle", () => {
    useAppStore.setState({ presence: [bob, zoe] });
    render(<PresenceBar />);

    const avatarBob = screen.getByTestId('presence-bob');
    expect(avatarBob).toHaveTextContent('BD');
    expect(avatarBob).toHaveAttribute('title', 'Bob Dupont');
    expect(avatarBob).toHaveStyle({ backgroundColor: '#00FF00' });

    const avatarZoe = screen.getByTestId('presence-zoe');
    expect(avatarZoe).toHaveTextContent('ZO');
    expect(avatarZoe).toHaveAttribute('title', 'Zoé');
  });

  it('affiche « Seul(e) sur cette vue » quand personne d’autre n’est connecté', () => {
    render(<PresenceBar />);
    expect(screen.getByTestId('presence-bar')).toHaveTextContent('Seul(e) sur cette vue');
  });
});

describe('ConnectionBanner', () => {
  it('reste invisible tant que le socket est connecté', () => {
    render(<ConnectionBanner />);
    expect(screen.queryByTestId('connection-banner')).toBeNull();
  });

  it('affiche le bandeau de reconnexion quand le socket tombe', () => {
    useAppStore.setState({ connected: false });
    render(<ConnectionBanner />);
    const banner = screen.getByTestId('connection-banner');
    expect(banner).toHaveTextContent(CONNECTION_LOST_MESSAGE);
    expect(banner).toHaveAttribute('role', 'status');
  });
});
