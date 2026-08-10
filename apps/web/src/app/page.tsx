import { SHARED_READY } from '@suivi/shared';

// Placeholder du socle : la vraie page (grille du mois courant) et la
// redirection vers /login arrivent dans les features suivantes.
// L'import de @suivi/shared prouve au build que transpilePackages fonctionne.
export default function HomePage() {
  return <main data-shared-ready={SHARED_READY}>Suivi commandes</main>;
}
