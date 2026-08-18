import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'quentin.durant49@orange.fr';
const PASSWORD = 'changeme';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('[data-testid="data-grid"]')).toBeVisible();
}

/** Première cellule de la colonne demandée, dans le corps de la grille. */
function cell(page: Page, colId: string) {
  return page
    .locator('.ag-center-cols-container .ag-row')
    .first()
    .locator(`[col-id="${colId}"]`);
}

test.describe('Grille de suivi des commandes', () => {
  test('une édition de cellule texte survit à un rechargement', async ({ page }) => {
    await login(page);

    // Une ligne fraîche garantit un test rejouable sans polluer les données.
    await page.locator('[data-testid="add-row"]').click();
    await expect(page.locator('.ag-center-cols-container .ag-row')).not.toHaveCount(0);

    const value = `E2E-${Date.now()}`;
    const clientCell = cell(page, 'client');
    await clientCell.dblclick();
    await page.locator('.ag-cell-editor input').fill(value);
    await page.keyboard.press('Enter');

    await expect(clientCell).toHaveText(value);

    await page.reload();
    await expect(page.locator('[data-testid="data-grid"]')).toBeVisible();
    await expect(cell(page, 'client')).toHaveText(value);
  });

  test('le changement de statut affiche la couleur du choix', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="add-row"]').click();
    // La ligne doit être rendue avant toute interaction : sans cette attente,
    // le double-clic part avant que la grille ne l'ait insérée.
    await expect(page.locator('.ag-center-cols-container .ag-row')).not.toHaveCount(0);

    const statutCell = cell(page, 'statut');
    await statutCell.dblclick();
    await expect(page.locator('[data-testid="select-editor"]')).toBeVisible();
    await page.locator('[data-testid="select-filter"]').fill('INSTALLATION');
    await page.locator('[data-testid="select-option-INSTALLATION"]').click();

    const pastille = statutCell.locator('[data-testid="select-pastille"]');
    await expect(pastille).toHaveText('INSTALLATION');
    // #9BDEB4 sur fond, #176638 en texte, gras — couleurs du contrat.
    await expect(pastille).toHaveCSS('background-color', 'rgb(155, 222, 180)');
    await expect(pastille).toHaveCSS('color', 'rgb(23, 102, 56)');
    await expect(pastille).toHaveCSS('font-weight', '700');

    await page.reload();
    await expect(
      cell(page, 'statut').locator('[data-testid="select-pastille"]'),
    ).toHaveCSS('background-color', 'rgb(155, 222, 180)');
  });
});
