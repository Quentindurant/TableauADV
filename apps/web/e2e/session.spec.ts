import { expect, test } from '@playwright/test';

const EMAIL = 'quentin.durant49@orange.fr';
const MOT_DE_PASSE = 'changeme';

async function seConnecter(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('http://localhost:3000/');
}

test("l'en-tête affiche le nom de l'utilisateur connecté", async ({ page }) => {
  await seConnecter(page);

  await expect(page.getByTestId('current-user')).toHaveText('Quentin');
});

test('la déconnexion ramène sur /login et interdit le retour sur /', async ({ page }) => {
  await seConnecter(page);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('un cookie token invalide est rejeté par le layout (retour /login)', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'token',
      value: 'nimporte.quoi.ici',
      domain: 'localhost',
      path: '/',
    },
  ]);

  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
});
