'use client';

import { CLE_TECHNICIENS, GestionChoix } from './listes';

/**
 * Référentiel des techniciens terrain : les choices de la colonne `nom_tech`,
 * gérés ici et uniquement ici (la colonne est retirée du sélecteur générique
 * de l'onglet « Listes & couleurs »). Mêmes mécanismes que les autres listes :
 * ajout, renommage, couleurs, archivage, suppression avec blocage
 * CHOICE_IN_USE, et diffusion temps réel `config.changed` côté API.
 */
export default function TechniciensTab() {
  return (
    <GestionChoix
      cleFixe={CLE_TECHNICIENS}
      ariaSection="Techniciens terrain"
      titreAjout="Ajouter un technicien"
      libelleNouvelleValeur="Nouveau technicien"
      boutonAjout="Ajouter le technicien"
    />
  );
}
