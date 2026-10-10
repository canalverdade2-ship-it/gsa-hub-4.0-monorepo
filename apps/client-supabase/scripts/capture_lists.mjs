import { chromium } from 'playwright';
import path from 'path';

async function testScreens() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

  // 1. Admin Orders List View
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_orders_list_1440x900.png') });
  console.log('Saved: gsa3_admin_orders_list_1440x900.png');

  // 2. Admin Contracts List View
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=contracts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_contracts_list_1440x900.png') });
  console.log('Saved: gsa3_admin_contracts_list_1440x900.png');

  await browser.close();
}

testScreens().catch(console.error);
