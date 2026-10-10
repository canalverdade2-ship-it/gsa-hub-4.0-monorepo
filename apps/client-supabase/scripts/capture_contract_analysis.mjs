import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  
  await page.goto('http://127.0.0.1:5180/?role=client&screen=contracts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Click on "Arquivo anexado" area to trigger handleSelectFile
  // Wait, handleSelectFile is triggered by a button inside.
  const attachBtn = page.locator('button:has-text("Selecionar arquivo em PDF")');
  if (await attachBtn.isVisible()) {
    await attachBtn.click();
    await page.waitForTimeout(400);
  }

  // Click "Enviar contrato assinado"
  const sendBtn = page.locator('button:has-text("Enviar contrato assinado")');
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
    await page.waitForTimeout(400);
  }

  // Close the success modal
  const okBtn = page.locator('button:has-text("Entendi")');
  if (await okBtn.isVisible()) {
    await okBtn.click();
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(artifactDir, 'gsa3_client_contract_in_analysis.png') });
  console.log('Saved: gsa3_client_contract_in_analysis.png');

  await browser.close();
}
capture().catch(console.error);
