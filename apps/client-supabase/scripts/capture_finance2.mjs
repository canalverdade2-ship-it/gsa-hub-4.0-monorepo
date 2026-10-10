import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=finance', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Click first row to open invoice details modal
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.isVisible()) {
    await firstRow.click();
    await page.waitForTimeout(400);
  }

  // Click on the installment card
  const installmentCard = page.locator('text=Parcela 1 de 1').first();
  if (await installmentCard.isVisible()) {
    await installmentCard.click();
    await page.waitForTimeout(400);
  }

  // Screenshot: Installment Modal with the Red Delete button
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_finance_red_button.png') });
  console.log('Saved: gsa3_admin_finance_red_button.png');

  await browser.close();
}
capture().catch(console.error);
