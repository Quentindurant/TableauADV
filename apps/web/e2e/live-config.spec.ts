import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'motdepasse-e2e';
const ALICE = 'alice.e2e@test.fr';
const BOB = 'bob.e2e@test.fr';

const MOIS_COURANT = new Date().toISOString().slice(0, 7);

const LABEL_AVANT = 'E2E LIVE AVANT';
const LABEL_APRES = 'E2E LIVE APRES';
const FOND_AVANT = 'rgb(255, 204, 0)';
const FOND_APRES = 'rgb(0, 128, 0)';

/**
 * La colonne « statut » est la 12e sur 16 (≈ 2550 px cumulés) : AG Grid
 * virtualise horizontalement et ne rend que les colonnes visibles, la fenêtre
 * doit donc être assez large pour que la cellule existe dans le DOM.
 */
const FENETRE = { width: 2800, height: 900 };

interface UtilisateurConnecte {
  id: string;
  displayName: string;
}

interface ColonneLegere {
  id: string;
  key: string;
  label: string;
}

/**
 * Connecte un contexte navigateur via l'API : le cookie httpOnly `token` est
 * posé dans le pot de cookies partagé du contexte, donc utilisable ensuite par
 * les pages ET par le socket.
 */
async function connecter(context: BrowserContext, email: string): Promise<UtilisateurConnecte> {
  const reponse = await context.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(reponse.ok(), `connexion ${email} : ${reponse.status()}`).toBe(true);
  const corps = (await reponse.json()) as { user: UtilisateurConnecte };
  return corps.user;
}

/** Pastille colorée rendue par `SelectCellRenderer` dans la cellule statut. */
function pastilleGrille(page: Page, rowId: string) {
  return page
    .locator(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="statut"] [data-testid="select-pastille"]`)
    .first();
}

test.describe('Propagation temps réel de la configuration', () => {
  test('un changement de couleur puis de libellé arrive chez le collègue sans rechargement', async ({
    browser,
  }) => {
    const contexteAlice = await browser.newContext({ viewport: FENETRE });
    const contexteBob = await browser.newContext({ viewport: FENETRE });

    const alice = await connecter(contexteAlice, ALICE);
    const bob = await connecter(contexteBob, BOB);
    const apiAlice: APIRequestContext = contexteAlice.request;

    // 1. Jeu de données dédié (aucune donnée du seed n'est modifiée) : un choix
    //    de statut jaune, posé sur une ligne du mois courant.
    const colonnes = (await (
      await apiAlice.get(`${API_URL}/api/columns`)
    ).json()) as ColonneLegere[];
    const statut = colonnes.find((colonne) => colonne.key === 'statut');
    if (statut === undefined) {
      throw new Error('Colonne « statut » absente : lancer `prisma db seed` avant le test.');
    }

    const creationChoix = await apiAlice.post(`${API_URL}/api/columns/${statut.id}/choices`, {
      data: { label: LABEL_AVANT, bgColor: '#ffcc00', textColor: '#000000', bold: false },
    });
    expect(creationChoix.ok(), 'création du choix de test').toBe(true);
    const choixId = ((await creationChoix.json()) as { id: string }).id;

    const creationLigne = await apiAlice.post(`${API_URL}/api/rows`, {
      data: { month: MOIS_COURANT },
    });
    expect(creationLigne.ok(), 'création de la ligne de test').toBe(true);
    const ligne = (await creationLigne.json()) as { id: string; version: number };

    await apiAlice.patch(`${API_URL}/api/rows/${ligne.id}`, {
      data: { expectedVersion: ligne.version, patch: { statut: LABEL_AVANT } },
    });

    const pageAlice = await contexteAlice.newPage();
    const pageBob = await contexteBob.newPage();

    try {
      // 2. Les deux ADV ouvrent la grille. La présence mutuelle prouve que les
      //    DEUX sockets sont connectés : sans cette garantie, un `config.changed`
      //    émis trop tôt partirait avant que Bob n'écoute et le test serait
      //    intermittent.
      await pageAlice.goto('/');
      await pageBob.goto('/');
      await expect(pageBob.getByTestId(`presence-${alice.id}`)).toBeVisible();
      await expect(pageAlice.getByTestId(`presence-${bob.id}`)).toBeVisible();

      // 3. Chez Bob, la pastille porte bien le libellé et la couleur initiaux.
      const pastilleBob = pastilleGrille(pageBob, ligne.id);
      await expect(pastilleBob).toHaveText(LABEL_AVANT);
      await expect(pastilleBob).toHaveCSS('background-color', FOND_AVANT);

      // 4. Alice part dans les paramètres et change la COULEUR du choix.
      await pageAlice.goto('/parametres');
      await pageAlice.getByRole('tab', { name: 'Listes & couleurs' }).click();
      await pageAlice.getByLabel('Colonne de type liste').selectOption({ label: statut.label });

      const fond = pageAlice.getByLabel(`Couleur de fond de ${LABEL_AVANT}`);
      await fond.fill('#008000');
      await fond.blur();
      await expect(pageAlice.getByTestId(`pastille-${choixId}`)).toHaveCSS(
        'background-color',
        FOND_APRES,
      );

      // 5. CŒUR DU TEST : chez Bob, SANS aucun rechargement, la pastille de la
      //    grille prend la nouvelle couleur (coalescence 200 ms + rechargement
      //    de la configuration, largement sous le timeout par défaut).
      await expect(pastilleBob).toHaveCSS('background-color', FOND_APRES);
      await expect(pastilleBob).toHaveText(LABEL_AVANT);

      // 6. Même exigence pour un RENOMMAGE : le nouveau libellé est propagé aux
      //    lignes existantes côté serveur, Bob doit le voir sans rechargement —
      //    et la pastille doit conserver sa couleur (sinon le libellé affiché ne
      //    correspondrait plus à aucun choix connu du client).
      await pageAlice.getByRole('button', { name: `Renommer le choix ${LABEL_AVANT}` }).click();
      const champLibelle = pageAlice.getByLabel(`Nouveau libellé de ${LABEL_AVANT}`);
      await champLibelle.fill(LABEL_APRES);
      await champLibelle.press('Enter');
      await expect(pageAlice.getByText('Renommage propagé aux lignes existantes.')).toBeVisible();

      await expect(pastilleBob).toHaveText(LABEL_APRES);
      await expect(pastilleBob).toHaveCSS('background-color', FOND_APRES);
    } finally {
      // 7. Nettoyage AVANT la fermeture des contextes (`apiAlice` est rattaché au
      //    contexte d'Alice) et la ligne d'abord, sinon DELETE /choices renvoie
      //    409 CHOICE_IN_USE.
      await apiAlice.delete(`${API_URL}/api/rows/${ligne.id}`);
      await apiAlice.delete(`${API_URL}/api/choices/${choixId}`);
      await contexteAlice.close();
      await contexteBob.close();
    }
  });
});
