import { chromium } from 'playwright';
import path from 'path';

async function testButtons() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

  console.log('1. Testing Clients list and Client 360...');
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=clients', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Click on Empresa Alfa to enter Client 360
  const clientRow = page.locator('text=Empresa Alfa Ltda').first();
  await clientRow.click();
  await page.waitForTimeout(500);

  // Switch to Propostas tab
  await page.locator('button:has-text("Propostas Comerciais")').click();
  await page.waitForTimeout(400);

  // Click "+ Nova Proposta"
  await page.locator('button:has-text("+ Nova Proposta")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_client360_proposal_modal.png') });
  console.log('Saved: gsa3_client360_proposal_modal.png');

  // Close proposal modal
  await page.locator('button:has-text("Cancelar")').click();
  await page.waitForTimeout(300);

  // Click "Editar Cadastro"
  await page.locator('button:has-text("Editar Cadastro")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_client360_edit_modal.png') });
  console.log('Saved: gsa3_client360_edit_modal.png');

  // Close edit modal
  await page.locator('button:has-text("Cancelar")').click();
  await page.waitForTimeout(300);

  // 2. Finance: Test + Nova Fatura modal
  console.log('2. Testing Finance modal...');
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=finance', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("+ Nova Fatura")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_finance_modal.png') });
  console.log('Saved: gsa3_admin_finance_modal.png');

  // Close finance modal
  await page.locator('button:has-text("Cancelar")').click();
  await page.waitForTimeout(300);

  // 3. Catalogs: Test Edit Service
  console.log('3. Testing Catalogs edit service...');
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=catalogs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Editar")').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_catalog_edit_modal.png') });
  console.log('Saved: gsa3_admin_catalog_edit_modal.png');

  await browser.close();
  console.log('All interactive button tests completed successfully!');
}

testButtons().catch(console.error);
