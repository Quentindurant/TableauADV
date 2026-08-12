import { expect, test } from '@playwright/test';

test('un seul header unifié sur la page du mois', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill('quentin.durant49@orange.fr');
  await page.getByLabel('Mot de passe').fill('changeme');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/');

  await expect(page.getByTestId('app-header')).toHaveCount(1);
  await expect(page.getByText('Suivi commandes', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('search')).toHaveCount(1);
  await expect(page.getByTestId('presence-bar')).toHaveCount(1);
  await expect(page.getByTestId('account-menu')).toHaveCount(1);
});
