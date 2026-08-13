'use client';

import type { UserDTO } from '@suivi/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiFetch } from '../../../lib/api';
import { aCodeErreur, messageErreurApi } from './messages';

export const COULEUR_CURSEUR_DEFAUT = '#3498db';

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter((mot) => mot.length > 0);
  if (mots.length === 0) {
    return '?';
  }
  if (mots.length === 1) {
    return mots[0].slice(0, 2).toUpperCase();
  }
  return `${mots[0].charAt(0)}${mots[1].charAt(0)}`.toUpperCase();
}

export default function EquipeTab() {
  const [membres, setMembres] = useState<UserDTO[]>([]);
  const [moi, setMoi] = useState<UserDTO | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [couleur, setCouleur] = useState(COULEUR_CURSEUR_DEFAUT);

  const [profilNom, setProfilNom] = useState('');
  const [profilCouleur, setProfilCouleur] = useState(COULEUR_CURSEUR_DEFAUT);
  const [profilMotDePasse, setProfilMotDePasse] = useState('');
  const [profilConfirmation, setProfilConfirmation] = useState('');

  const charger = useCallback(async (): Promise<void> => {
    try {
      const liste = await apiFetch<UserDTO[]>('/users');
      setMembres(liste);
      const session = await apiFetch<{ user: UserDTO }>('/auth/me');
      setMoi(session.user);
      setProfilNom(session.user.displayName);
      setProfilCouleur(session.user.cursorColor.toLowerCase());
      setErreur(null);
    } catch (err) {
      setErreur(messageErreurApi(err));
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ajouterMembre = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
    evenement.preventDefault();
    setInfo(null);
    if (!email.includes('@')) {
      setErreur('Saisissez une adresse email valide.');
      return;
    }
    if (nom.trim() === '') {
      setErreur('Le nom affiché est obligatoire.');
      return;
    }
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe initial doit contenir au moins 8 caractères.');
      return;
    }
    try {
      const cree = await apiFetch<UserDTO>('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          displayName: nom.trim(),
          password: motDePasse,
          cursorColor: couleur,
        }),
      });
      setMembres((precedents) => [...precedents, cree]);
      setEmail('');
      setNom('');
      setMotDePasse('');
      setCouleur(COULEUR_CURSEUR_DEFAUT);
      setErreur(null);
      setInfo(`Membre « ${cree.displayName} » ajouté.`);
    } catch (err) {
      if (aCodeErreur(err, 'VALIDATION_FAILED')) {
        setErreur(
          'Impossible d’ajouter ce membre : cette adresse email est peut-être déjà utilisée, ou un champ est invalide.',
        );
        return;
      }
      setErreur(messageErreurApi(err));
    }
  };

  const enregistrerProfil = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
    evenement.preventDefault();
    setInfo(null);
    if (profilNom.trim() === '') {
      setErreur('Le nom affiché est obligatoire.');
      return;
    }
    if (profilMotDePasse !== '' && profilMotDePasse.length < 8) {
      setErreur('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (profilMotDePasse !== profilConfirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    const corps: { displayName: string; cursorColor: string; password?: string } = {
      displayName: profilNom.trim(),
      cursorColor: profilCouleur,
    };
    if (profilMotDePasse !== '') {
      corps.password = profilMotDePasse;
    }
    try {
      const misAJour = await apiFetch<UserDTO>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(corps),
      });
      setMoi(misAJour);
      setMembres((precedents) =>
        precedents.map((membre) => (membre.id === misAJour.id ? misAJour : membre)),
      );
      setProfilMotDePasse('');
      setProfilConfirmation('');
      setErreur(null);
      setInfo('Profil enregistré.');
    } catch (err) {
      setErreur(messageErreurApi(err));
    }
  };

  return (
    <section aria-label="Équipe">
      {erreur !== null && <p role="alert">{erreur}</p>}
      {info !== null && <p role="status">{info}</p>}

      <h3>Membres</h3>
      <ul>
        {membres.map((membre) => (
          <li key={membre.id}>
            <span
              data-testid={`avatar-${membre.id}`}
              aria-hidden="true"
              style={{
                backgroundColor: membre.cursorColor,
                color: '#ffffff',
                display: 'inline-block',
                width: '2rem',
                height: '2rem',
                lineHeight: '2rem',
                textAlign: 'center',
                borderRadius: '50%',
              }}
            >
              {initiales(membre.displayName)}
            </span>
            <strong>{membre.displayName}</strong>
            <span>{membre.email}</span>
            {moi !== null && moi.id === membre.id && <em> (vous)</em>}
          </li>
        ))}
      </ul>

      <form
        onSubmit={(evenement) => {
          void ajouterMembre(evenement);
        }}
      >
        <h3>Ajouter un membre</h3>
        <label htmlFor="membre-email">Email</label>
        <input
          id="membre-email"
          type="email"
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
        />
        <label htmlFor="membre-nom">Nom affiché</label>
        <input id="membre-nom" value={nom} onChange={(evenement) => setNom(evenement.target.value)} />
        <label htmlFor="membre-mdp">Mot de passe initial</label>
        <input
          id="membre-mdp"
          type="password"
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
        />
        <label htmlFor="membre-couleur">Couleur du curseur</label>
        <input
          id="membre-couleur"
          type="color"
          value={couleur}
          onChange={(evenement) => setCouleur(evenement.target.value)}
        />
        <button type="submit">Ajouter le membre</button>
      </form>

      <form
        onSubmit={(evenement) => {
          void enregistrerProfil(evenement);
        }}
      >
        <h3>Mon profil</h3>
        <label htmlFor="profil-nom">Mon nom affiché</label>
        <input
          id="profil-nom"
          value={profilNom}
          onChange={(evenement) => setProfilNom(evenement.target.value)}
        />
        <label htmlFor="profil-couleur">Ma couleur de curseur</label>
        <input
          id="profil-couleur"
          type="color"
          value={profilCouleur}
          onChange={(evenement) => setProfilCouleur(evenement.target.value)}
        />
        <label htmlFor="profil-mdp">Nouveau mot de passe</label>
        <input
          id="profil-mdp"
          type="password"
          value={profilMotDePasse}
          onChange={(evenement) => setProfilMotDePasse(evenement.target.value)}
        />
        <label htmlFor="profil-mdp-confirmation">Confirmation du nouveau mot de passe</label>
        <input
          id="profil-mdp-confirmation"
          type="password"
          value={profilConfirmation}
          onChange={(evenement) => setProfilConfirmation(evenement.target.value)}
        />
        <button type="submit">Enregistrer mon profil</button>
      </form>
    </section>
  );
}
