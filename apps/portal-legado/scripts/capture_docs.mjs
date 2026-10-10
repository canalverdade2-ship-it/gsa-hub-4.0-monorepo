import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=documents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Select a client in the dropdown
  const select = page.locator('select.form-select').first();
  if (await select.isVisible()) {
    await select.selectOption({ label: 'Empresa Alfa Ltda' });
    await page.waitForTimeout(400);
  }

  // Hover over the custom folder so edit/delete icons appear, if CSS requires hover, but we just rendered them directly.
  
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_documents_custom_folders.png') });
  console.log('Saved: gsa3_admin_documents_custom_folders.png');

  await browser.close();
}
capture().catch(console.error);
