import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'motdepasse-e2e';
const ALICE = 'alice.e2e@test.fr';
const BOB = 'bob.e2e@test.fr';

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

interface LoggedUser {
  id: string;
  displayName: string;
}

/**
 * Connecte un contexte navigateur via l'API : le cookie httpOnly `token`
 * est posé dans le pot de cookies partagé du contexte, donc utilisable
 * ensuite par les pages ET par le socket.
 */
async function loginContext(context: BrowserContext, email: string): Promise<LoggedUser> {
  const response = await context.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(response.ok(), `login ${email} : ${response.status()}`).toBe(true);
  const body = (await response.json()) as { user: LoggedUser };
  return body.user;
}

function cellLocator(page: Page, rowId: string, colKey: string) {
  return page.locator(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="${colKey}"]`).first();
}

test.describe('Co-édition à deux navigateurs', () => {
  let rowId = '';
  let apiAlice: APIRequestContext;

  test('présence, verrou visible et diffusion sans rechargement', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const alice = await loginContext(contextA, ALICE);
    const bob = await loginContext(contextB, BOB);
    apiAlice = contextA.request;

    // Ligne de travail créée via l'API dans le mois courant (vue « / »).
    const created = await apiAlice.post(`${API_URL}/api/rows`, {
      data: { month: CURRENT_MONTH },
    });
    expect(created.ok()).toBe(true);
    rowId = ((await created.json()) as { id: string }).id;

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await pageA.goto('/');
    await pageB.goto('/');

    // 1. A voit la présence de B (avatar avec ses initiales et sa couleur).
    const avatarBob = pageA.getByTestId(`presence-${bob.id}`);
    await expect(avatarBob).toBeVisible();
    await expect(avatarBob).toHaveText('BD');
    await expect(avatarBob).toHaveAttribute('title', 'Bob Dupont');

    // Symétriquement, B voit Alice.
    await expect(pageB.getByTestId(`presence-${alice.id}`)).toBeVisible();

    // 2. B entre en édition sur la cellule CLIENT : A la voit verrouillée.
    const cellB = cellLocator(pageB, rowId, 'client');
    await cellB.dblclick();
    const cellA = cellLocator(pageA, rowId, 'client');
    await expect(cellA).toHaveClass(/coedition-locked/);

    // 3. B valide sa saisie : A reçoit la nouvelle valeur SANS rechargement.
    await pageB.keyboard.type('ARCADIA');
    await pageB.keyboard.press('Enter');
    await expect(cellA).toHaveText('ARCADIA');

    // 4. Le verrou est relâché à la fin de l'édition.
    await expect(cellA).not.toHaveClass(/coedition-locked/);

    // Nettoyage AVANT la fermeture des contextes : `apiAlice` est rattaché au
    // contexte d'Alice, il devient inutilisable une fois celui-ci fermé.
    if (rowId) {
      await apiAlice.delete(`${API_URL}/api/rows/${rowId}`);
      rowId = '';
    }

    await contextA.close();
    await contextB.close();
  });
});
