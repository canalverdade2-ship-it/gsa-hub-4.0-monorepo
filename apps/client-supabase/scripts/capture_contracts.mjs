
import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

async function captureContracts() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  
  // 1366x768
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=contracts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  
  const novoBtn = page.locator('button:has-text(\Novo contrato\)').first();
  if (await novoBtn.isVisible()) {
    await novoBtn.click();
    await page.waitForTimeout(800);
  }
  
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_contracts_fixed_1366x768.png'), fullPage: true });
  console.log('Saved: gsa3_admin_contracts_fixed_1366x768.png');

  // Mobile 390x844
  const pageMob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pageMob.goto('http://127.0.0.1:5180/?role=admin&screen=contracts', { waitUntil: 'networkidle' });
  await pageMob.waitForTimeout(500);
  
  const novoBtnMob = pageMob.locator('button:has-text(\Novo contrato\)').first();
  if (await novoBtnMob.isVisible()) {
    await novoBtnMob.click();
    await pageMob.waitForTimeout(800);
  }
  await pageMob.screenshot({ path: path.join(artifactDir, 'gsa3_admin_contracts_fixed_390x844.png'), fullPage: true });
  console.log('Saved: gsa3_admin_contracts_fixed_390x844.png');

  await browser.close();
}
captureContracts().catch(console.error);

