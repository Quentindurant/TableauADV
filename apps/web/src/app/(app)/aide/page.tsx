import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Aide — Suivi commandes',
};

/**
 * Documentation utilisateur intégrée, à destination des ADV : tableau,
 * navigation entre les mois, filtres, co-édition et Paramètres. Page
 * entièrement statique (aucun état, aucun appel réseau) : elle décrit ce que
 * l'application fait réellement — toute évolution fonctionnelle doit être
 * répercutée ici.
 */

/** Couleurs MÉTIER du surlignage, identiques à HighlightPalette.tsx. */
const COULEURS_SURLIGNAGE: { label: string; value: string }[] = [
  { label: 'Rouge', value: '#EE7A6D' },
  { label: 'Orange', value: '#F5B041' },
  { label: 'Jaune', value: '#F7DC6F' },
  { label: 'Vert', value: '#7DCEA0' },
  { label: 'Bleu', value: '#85C1E9' },
  { label: 'Violet', value: '#BB8FCE' },
];

/** Sommaire et sections partagent cette liste : les ancres restent alignées. */
const SECTIONS: { id: string; icone: string; titre: string; accent: 'orange' | 'petrol' | 'violet' }[] = [
  { id: 'prise-en-main', icone: '🚀', titre: 'Prise en main', accent: 'orange' },
  { id: 'tableau', icone: '✏️', titre: 'Le tableau', accent: 'petrol' },
  { id: 'mois', icone: '📅', titre: 'Mois et archives', accent: 'violet' },
  { id: 'filtres', icone: '🔍', titre: 'Filtres et recherche', accent: 'orange' },
  { id: 'clic-droit', icone: '🖱️', titre: 'Menu du clic droit', accent: 'petrol' },
  { id: 'co-edition', icone: '👥', titre: 'Travailler à plusieurs', accent: 'violet' },
  { id: 'parametres', icone: '⚙️', titre: 'Paramètres', accent: 'orange' },
  { id: 'import', icone: '📥', titre: 'Import du classeur', accent: 'petrol' },
];

function Section({ id, children }: { id: string; children: ReactNode }) {
  const section = SECTIONS.find((element) => element.id === id);
  if (!section) return null;
  return (
    <section
      id={section.id}
      aria-labelledby={`aide-titre-${section.id}`}
      className={`gc-aide__section gc-aide__section--${section.accent}`}
    >
      <h2 id={`aide-titre-${section.id}`} className="gc-aide__titre">
        <span aria-hidden="true" className="gc-aide__icone">
          {section.icone}
        </span>
        {section.titre}
      </h2>
      {children}
    </section>
  );
}

/** Ligne « action → effet » : l'action en gras, la flèche à l'accent de la section. */
function Action({ action, children }: { action: ReactNode; children: ReactNode }) {
  return (
    <li>
      <strong className="gc-aide__action">{action}</strong>
      <span aria-hidden="true" className="gc-aide__fleche">
        →
      </span>
      <span className="gc-aide__effet">{children}</span>
    </li>
  );
}

export default function AidePage() {
  return (
    <main className="gc-aide">
      <h1>Aide</h1>
      <p className="gc-aide__intro">
        Le tableau de suivi des commandes, expliqué écran par écran. Tout se fait dans le
        navigateur, chaque modification est enregistrée aussitôt.
      </p>

      <nav aria-label="Sommaire" className="gc-aide__sommaire">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            <span aria-hidden="true">{section.icone}</span>
            {section.titre}
          </a>
        ))}
      </nav>

      <Section id="prise-en-main">
        <ol className="gc-aide__etapes">
          <li>
            <strong>Se connecter.</strong> Adresse e-mail et mot de passe sur l&apos;écran de
            connexion.
          </li>
          <li>
            <strong>Choisir son mois.</strong> Pilule centrale du bandeau du bas&nbsp;: ◀ pour le
            mois précédent, ▶ pour le suivant.
          </li>
          <li>
            <strong>Éditer une cellule.</strong> Double-clic, saisir, puis <kbd>Entrée</kbd>.
          </li>
          <li>
            <strong>Poser un filtre.</strong> Taper dans le champ sous l&apos;en-tête d&apos;une
            colonne.
          </li>
        </ol>
      </Section>

      <Section id="tableau">
        <ul className="gc-aide__liste">
          <Action action="Double-clic sur une cellule">
            édition. <kbd>Entrée</kbd> valide, <kbd>Échap</kbd> annule.
          </Action>
          <Action action="Colonne de type Liste">
            pastilles de choix colorées&nbsp;; un champ «&nbsp;Filtrer…&nbsp;» aide à trouver le bon
            choix.
          </Action>
          <Action action="Colonne de type Date">affichage au format 14/08/2026.</Action>
          <Action
            action={
              <>
                Clic simple / <kbd>Maj</kbd>+clic
              </>
            }
          >
            sélectionne une cellule&nbsp;/ étend la sélection dans la même colonne.
          </Action>
          <Action
            action={
              <>
                <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd>
              </>
            }
          >
            copie la cellule&nbsp;/ colle sur la sélection de la colonne.
          </Action>
          <Action action="« + Ajouter une ligne » (en bas)">
            nouvelle ligne en fin de mois.
          </Action>
          <Action action="Glisser la poignée en début de ligne">réordonne les lignes.</Action>
          <Action action="Redimensionner ou déplacer une colonne">
            largeur et ordre sont mémorisés pour tout le monde.
          </Action>
        </ul>
      </Section>

      <Section id="mois">
        <ul className="gc-aide__liste">
          <Action action="◀ / ▶">mois existant précédent&nbsp;/ suivant.</Action>
          <Action action="Pilule centrale (ex. AOUT 2026)">
            ouvre la liste de tous les mois, du plus récent au plus ancien.
          </Action>
          <Action action="(42) à côté du mois">nombre de dossiers du mois.</Action>
          <Action action="+">crée le mois suivant le plus récent.</Action>
          <Action action="ARCHIVES">
            dossiers archivés, dans la même grille. «&nbsp;Retour aux mois&nbsp;» pour revenir.
          </Action>
        </ul>
      </Section>

      <Section id="filtres">
        <ul className="gc-aide__liste">
          <Action action="Champ sous un en-tête de colonne">
            ne garde que les lignes dont la colonne contient le texte tapé.
          </Action>
          <Action action="Filtres personnels">
            chacun voit sa propre grille filtrée, jamais celle des collègues.
          </Action>
          <Action action="Compteur « 12 / 42 dossiers »">
            lignes affichées&nbsp;/ total du mois quand un filtre est actif.
          </Action>
          <Action action="« Réinitialiser les filtres »">efface tous les filtres d&apos;un coup.</Action>
          <Action action="Filtrer une date">
            taper ce qui est lu à l&apos;écran&nbsp;: 14/08 trouve le 14/08/2026.
          </Action>
          <Action action="Recherche du bandeau du haut">
            cherche dans tous les mois et les archives&nbsp;; résultats groupés par mois&nbsp;; un
            clic sur un résultat ouvre son mois.
          </Action>
        </ul>
      </Section>

      <Section id="clic-droit">
        <ul className="gc-aide__liste">
          <Action action="Insérer une ligne">au-dessus ou en-dessous de la ligne visée.</Action>
          <Action action="Déplacer vers un autre mois">
            la ligne rejoint le mois choisi.
          </Action>
          <Action action="Archiver / Désarchiver">
            sort la ligne du mois vers ARCHIVES, ou l&apos;en fait revenir.
          </Action>
          <Action action="Historique de la ligne">
            panneau latéral&nbsp;: qui a modifié quoi, et quand.
          </Action>
          <Action action="Supprimer la ligne">
            suppression définitive, toujours précédée d&apos;une confirmation.
          </Action>
          <Action action="Surligner la colonne visée">
            <span className="gc-aide__pastilles">
              {COULEURS_SURLIGNAGE.map((couleur) => (
                <span
                  key={couleur.value}
                  className="gc-aide__pastille"
                  title={couleur.label}
                  // Couleur MÉTIER du surlignage, identique à la palette de la grille.
                  style={{ background: couleur.value }}
                />
              ))}
            </span>
            6 couleurs (IMPE&nbsp;: rouge et orange seulement), «&nbsp;Effacer&nbsp;» retire le
            surlignage.
          </Action>
          <Action action={<kbd>Échap</kbd>}>ferme le menu.</Action>
        </ul>
      </Section>

      <Section id="co-edition">
        <ul className="gc-aide__liste">
          <Action action="Avatars du bandeau du haut">
            collègues connectés sur la même vue. Sinon&nbsp;: «&nbsp;Seul(e) sur cette
            vue&nbsp;».
          </Action>
          <Action action="Liseré coloré + étiquette sur une cellule">
            un collègue est positionné dessus&nbsp;; la couleur est la sienne.
          </Action>
          <Action action="Cellule hachurée">
            un collègue est en train de la modifier&nbsp;: elle est verrouillée le temps de sa
            saisie.
          </Action>
          <Action action="Modifications des collègues">
            apparaissent en direct, sans recharger la page.
          </Action>
          <Action action="« Connexion perdue — reconnexion... »">
            la liaison temps réel est tombée&nbsp;; elle se rétablit toute seule.
          </Action>
        </ul>
      </Section>

      <Section id="parametres">
        <p className="gc-aide__note">
          Ouverture&nbsp;: menu du compte (en haut à droite) → «&nbsp;Profil et
          paramètres&nbsp;». Cinq onglets&nbsp;:
        </p>
        <div className="gc-aide__tableau">
          <table>
            <thead>
              <tr>
                <th scope="col">Onglet</th>
                <th scope="col">Sert à</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Colonnes</th>
                <td>
                  Ajouter, renommer, masquer, régler la largeur, supprimer. Types&nbsp;: Texte,
                  Texte long, Date, Heure, Nombre, Liste, Lien. Changer le type ne convertit
                  jamais les valeurs déjà saisies.
                </td>
              </tr>
              <tr>
                <th scope="row">Listes &amp; couleurs</th>
                <td>
                  Valeurs des colonnes de type Liste&nbsp;: libellé, couleur de fond, couleur du
                  texte, gras, archivage. Suppression bloquée si la valeur est utilisée.
                </td>
              </tr>
              <tr>
                <th scope="row">Techniciens terrain</th>
                <td>Même mécanique, réservée à la liste des techniciens.</td>
              </tr>
              <tr>
                <th scope="row">Équipe</th>
                <td>
                  Ajouter un membre (e-mail, nom, couleur de curseur, mot de passe initial de 8
                  caractères minimum). Mon profil&nbsp;: ma couleur, mon mot de passe.
                </td>
              </tr>
              <tr>
                <th scope="row">Import</th>
                <td>Importer le classeur Zoho (.xlsx) — détails ci-dessous.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="import">
        <ul className="gc-aide__liste">
          <Action action="Fichier .xlsx du classeur Zoho">
            fusion incrémentale, onglet par onglet (un onglet = un mois).
          </Action>
          <Action action="Jamais de suppression">
            une ligne absente du fichier reste intacte en base.
          </Action>
          <Action action="Cellule vide dans le fichier">
            n&apos;écrase jamais une valeur déjà saisie dans le tableau.
          </Action>
          <Action action="Correspondance douteuse (même client en double)">
            ligne laissée telle quelle, signalée comme ambiguïté dans le rapport.
          </Action>
          <Action action="Valeur hors liste">importée telle quelle, signalée dans le rapport.</Action>
          <Action action="Ordre des lignes">
            aligné sur la feuille&nbsp;: le fichier fait foi pour l&apos;ordre du mois.
          </Action>
          <Action action="Rapport de fin d'import">
            par onglet&nbsp;: créées, mises à jour, inchangées, réordonnées, ambiguïtés.
          </Action>
        </ul>
      </Section>
    </main>
  );
}
