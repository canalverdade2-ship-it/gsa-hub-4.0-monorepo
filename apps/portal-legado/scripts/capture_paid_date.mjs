import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  
  await page.goto('http://127.0.0.1:5180/?role=admin&screen=clients', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Click on the first client row
  const firstClient = page.locator('tbody tr').first();
  if (await firstClient.isVisible()) {
    await firstClient.click();
    await page.waitForTimeout(400);
  }

  // Click "Financeiro" tab via specific selector
  const financeTab = page.locator('.nav-item').filter({ hasText: 'Financeiro' });
  if (await financeTab.isVisible()) {
    await financeTab.click();
    await page.waitForTimeout(400);
  }

  // Click "Ver Fatura/Parcelas"
  const viewInvoiceBtn = page.locator('button:has-text("Ver Fatura")').first();
  if (await viewInvoiceBtn.isVisible()) {
    await viewInvoiceBtn.click();
    await page.waitForTimeout(400);
  }

  // Click "Registrar Pagamento"
  const payBtn = page.locator('button:has-text("Registrar Pagamento")').first();
  if (await payBtn.isVisible()) {
    await payBtn.click();
    await page.waitForTimeout(400);
  }

  // Click "Confirmar Recebimento" inside the modal
  const confirmBtn = page.locator('button:has-text("Confirmar Recebimento")');
  if (await confirmBtn.isVisible()) {
    await confirmBtn.click();
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(artifactDir, 'gsa3_admin_client360_paid_date.png') });
  console.log('Saved: gsa3_admin_client360_paid_date.png');

  await browser.close();
}
capture().catch(console.error);
