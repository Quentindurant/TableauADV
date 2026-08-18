import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const EMAIL = process.env.E2E_EMAIL ?? 'quentin.durant49@orange.fr';
const MOT_DE_PASSE = process.env.E2E_PASSWORD ?? 'changeme';

const MOIS_COURANT = new Date().toISOString().slice(0, 7);

interface ColonneLegere {
  id: string;
  key: string;
}

test.describe('Paramètres — listes & couleurs', () => {
  test('renommer un choix de statut et changer sa couleur se répercute dans la grille', async ({
    page,
  }) => {
    // La vérification finale lit une cellule de la colonne « statut » (12e sur
    // 16, 2550 px de colonnes) : AG Grid ne rend que les colonnes visibles,
    // il faut donc une fenêtre assez large pour qu'elle existe dans le DOM.
    await page.setViewportSize({ width: 2800, height: 900 });

    // 1. Session : le cookie est posé pour l'hôte « localhost », donc valable
    //    pour le front (:3000) comme pour l'API (:3001).
    const connexion = await page.request.post(`${API}/api/auth/login`, {
      data: { email: EMAIL, password: MOT_DE_PASSE },
    });
    expect(connexion.ok(), 'connexion avec l’utilisateur du seed').toBeTruthy();

    // 2. Jeu de données dédié au test (aucune donnée du seed n'est modifiée).
    const colonnes = (await (await page.request.get(`${API}/api/columns`)).json()) as ColonneLegere[];
    const statut = colonnes.find((colonne) => colonne.key === 'statut');
    if (statut === undefined) {
      throw new Error('Colonne « statut » absente : lancer `prisma db seed` avant le test.');
    }

    const choix = (await (
      await page.request.post(`${API}/api/columns/${statut.id}/choices`, {
        data: { label: 'E2E AVANT', bgColor: '#ffcc00', textColor: '#000000', bold: false },
      })
    ).json()) as { id: string };

    const ligne = (await (
      await page.request.post(`${API}/api/rows`, { data: { month: MOIS_COURANT } })
    ).json()) as { id: string; version: number };

    await page.request.patch(`${API}/api/rows/${ligne.id}`, {
      data: { expectedVersion: ligne.version, patch: { statut: 'E2E AVANT' } },
    });

    try {
      // 3. Renommage depuis les paramètres.
      await page.goto('/parametres');
      await page.getByRole('tab', { name: 'Listes & couleurs' }).click();
      await page.getByLabel('Colonne de type liste').selectOption({ label: 'INSTALLATION' });

      await page.getByRole('button', { name: 'Renommer le choix E2E AVANT' }).click();
      const champ = page.getByLabel('Nouveau libellé de E2E AVANT');
      await champ.fill('E2E APRES');
      await champ.press('Enter');
      await expect(page.getByText('Renommage propagé aux lignes existantes.')).toBeVisible();

      // 4. Nouvelle couleur de fond : la pastille se met à jour tout de suite.
      const fond = page.getByLabel('Couleur de fond de E2E APRES');
      await fond.fill('#008000');
      await fond.blur();
      await expect(page.getByTestId(`pastille-${choix.id}`)).toHaveCSS(
        'background-color',
        'rgb(0, 128, 0)',
      );

      // 5. Retour à la grille : valeur renommée ET couleur appliquées.
      await page.goto('/');
      // La grille doit être montée avant de chercher une cellule : sinon la
      // recherche part sur une page encore vide.
      await expect(page.locator('[data-testid="data-grid"]')).toBeVisible();
      const cellule = page.getByText('E2E APRES').first();
      await expect(cellule).toBeVisible();

      const couleurRendue = await cellule.evaluate((element) => {
        let noeud: HTMLElement | null = element as HTMLElement;
        while (noeud !== null) {
          const fondCalcule = window.getComputedStyle(noeud).backgroundColor;
          if (fondCalcule !== 'rgba(0, 0, 0, 0)' && fondCalcule !== 'transparent') {
            return fondCalcule;
          }
          noeud = noeud.parentElement;
        }
        return '';
      });
      expect(couleurRendue).toBe('rgb(0, 128, 0)');
    } finally {
      // 6. Nettoyage : la ligne d'abord (sinon DELETE /choices renvoie 409 CHOICE_IN_USE).
      await page.request.delete(`${API}/api/rows/${ligne.id}`);
      await page.request.delete(`${API}/api/choices/${choix.id}`);
    }
  });
});
