import type { ErrorCode } from '@suivi/shared';

/**
 * Forme structurelle d'une erreur remontée par `apiFetch` (lib/api.ts, Feature 6).
 * On ne dépend pas de la classe elle-même : un objet { status, code, message }
 * suffit, ce qui rend les tests indépendants de l'implémentation du client HTTP.
 */
export interface ErreurApi {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function estErreurApi(err: unknown): err is ErreurApi {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const candidat = err as Record<string, unknown>;
  return (
    typeof candidat.status === 'number' &&
    typeof candidat.code === 'string' &&
    typeof candidat.message === 'string'
  );
}

export function aCodeErreur(err: unknown, code: ErrorCode): boolean {
  return estErreurApi(err) && err.code === code;
}

const MESSAGES: Record<ErrorCode, string> = {
  AUTH_INVALID: 'Email ou mot de passe incorrect.',
  AUTH_REQUIRED: 'Votre session a expiré : veuillez vous reconnecter.',
  VALIDATION_FAILED: 'Données invalides : vérifiez les champs saisis.',
  NOT_FOUND: 'Élément introuvable : il vient peut-être d’être supprimé par un collègue.',
  VERSION_CONFLICT: 'Modifié par un collègue entre-temps : la valeur affichée a été rechargée.',
  COLUMN_HAS_DATA: 'Cette colonne contient déjà des données.',
  CHOICE_IN_USE:
    'Cette valeur est utilisée par des lignes existantes. Conseil : archivez-la plutôt que de la supprimer — les lignes la conservent et elle n’est plus proposée à la saisie.',
  LOCKED: 'Cette cellule est en cours d’édition par un collègue.',
};

export function messageErreurApi(err: unknown): string {
  if (!estErreurApi(err)) {
    return 'Une erreur est survenue. Vérifiez votre connexion puis réessayez.';
  }
  const traduction: string | undefined = MESSAGES[err.code];
  return traduction ?? err.message;
}
