import { expect, test } from '@playwright/test';

const EMAIL = 'quentin.durant49@orange.fr';
const MOT_DE_PASSE = 'changeme';

test('mot de passe incorrect : message en français, on reste sur /login', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.');
  await expect(page).toHaveURL(/\/login$/);
});

test('bon mot de passe : redirection vers /', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL('http://localhost:3000/');
});

test('accès direct à / sans cookie : redirection vers /login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});
