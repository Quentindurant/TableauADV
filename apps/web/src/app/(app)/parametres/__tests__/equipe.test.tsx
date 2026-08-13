import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserDTO } from '@suivi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../../../lib/api';
import EquipeTab, { initiales } from '../equipe';

const apiFetchMock = vi.mocked(apiFetch);

const QUENTIN: UserDTO = {
  id: 'u1',
  email: 'quentin.durant49@orange.fr',
  displayName: 'Quentin Durant',
  cursorColor: '#3498db',
};
const LAURENT: UserDTO = {
  id: 'u2',
  email: 'laurent@example.fr',
  displayName: 'Laurent',
  cursorColor: '#e74c3c',
};

function chargementReussi(): void {
  apiFetchMock.mockResolvedValueOnce([QUENTIN, LAURENT]).mockResolvedValueOnce({ user: QUENTIN });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('EquipeTab', () => {
  it('initiales gère un nom, deux mots et une chaîne vide', () => {
    expect(initiales('Quentin Durant')).toBe('QD');
    expect(initiales('Laurent')).toBe('LA');
    expect(initiales('   ')).toBe('?');
  });

  it('affiche les membres avec leur avatar coloré et leur email', async () => {
    chargementReussi();

    render(<EquipeTab />);

    expect(await screen.findByText('Laurent')).toBeInTheDocument();
    expect(screen.getByText('laurent@example.fr')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-u2')).toHaveStyle({ backgroundColor: '#e74c3c' });
    expect(screen.getByTestId('avatar-u1')).toHaveTextContent('QD');
    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/users');
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/auth/me');
  });

  it('ajoute un membre via POST /users', async () => {
    const utilisateur = userEvent.setup();
    chargementReussi();
    apiFetchMock.mockResolvedValueOnce({
      id: 'u3',
      email: 'marco@example.fr',
      displayName: 'Marco',
      cursorColor: '#2ecc71',
    });

    render(<EquipeTab />);
    await screen.findByText('Laurent');

    await utilisateur.type(screen.getByLabelText('Email'), 'marco@example.fr');
    await utilisateur.type(screen.getByLabelText('Nom affiché'), 'Marco');
    await utilisateur.type(screen.getByLabelText('Mot de passe initial'), 'motdepasse1');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le membre' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'marco@example.fr',
          displayName: 'Marco',
          password: 'motdepasse1',
          cursorColor: '#3498db',
        }),
      }),
    );
    expect(await screen.findByText('Marco')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Membre « Marco » ajouté.');
  });

  it('refuse un mot de passe trop court sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    chargementReussi();

    render(<EquipeTab />);
    await screen.findByText('Laurent');

    await utilisateur.type(screen.getByLabelText('Email'), 'marco@example.fr');
    await utilisateur.type(screen.getByLabelText('Nom affiché'), 'Marco');
    await utilisateur.type(screen.getByLabelText('Mot de passe initial'), 'court');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le membre' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Le mot de passe initial doit contenir au moins 8 caractères.',
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('traduit un 422 VALIDATION_FAILED en conseil sur l’email déjà utilisé', async () => {
    const utilisateur = userEvent.setup();
    chargementReussi();
    apiFetchMock.mockRejectedValueOnce({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'email déjà utilisé',
    });

    render(<EquipeTab />);
    await screen.findByText('Laurent');

    await utilisateur.type(screen.getByLabelText('Email'), 'laurent@example.fr');
    await utilisateur.type(screen.getByLabelText('Nom affiché'), 'Laurent bis');
    await utilisateur.type(screen.getByLabelText('Mot de passe initial'), 'motdepasse1');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le membre' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'cette adresse email est peut-être déjà utilisée',
    );
  });

  it('enregistre le profil sans mot de passe quand le champ est vide', async () => {
    const utilisateur = userEvent.setup();
    chargementReussi();
    apiFetchMock.mockResolvedValueOnce({ ...QUENTIN, displayName: 'Quentin D.' });

    render(<EquipeTab />);
    const champ = await screen.findByLabelText('Mon nom affiché');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'Quentin D.');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Quentin D.', cursorColor: '#3498db' }),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Profil enregistré.');
  });

  it('envoie le nouveau mot de passe quand il est saisi et confirmé', async () => {
    const utilisateur = userEvent.setup();
    chargementReussi();
    apiFetchMock.mockResolvedValueOnce(QUENTIN);

    render(<EquipeTab />);
    await screen.findByLabelText('Mon nom affiché');

    await utilisateur.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveaumdp1');
    await utilisateur.type(screen.getByLabelText('Confirmation du nouveau mot de passe'), 'nouveaumdp1');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: 'Quentin Durant',
          cursorColor: '#3498db',
          password: 'nouveaumdp1',
        }),
      }),
    );
  });

  it('refuse deux mots de passe différents', async () => {
    const utilisateur = userEvent.setup();
    chargementReussi();

    render(<EquipeTab />);
    await screen.findByLabelText('Mon nom affiché');

    await utilisateur.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveaumdp1');
    await utilisateur.type(screen.getByLabelText('Confirmation du nouveau mot de passe'), 'nouveaumdp2');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Les deux mots de passe ne correspondent pas.',
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
