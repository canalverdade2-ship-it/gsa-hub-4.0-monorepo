import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

async function runCapture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // 1. Exact 1366x768 Desktop Viewport (User's display) with Modal Opened
  {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto('http://127.0.0.1:5180/?role=admin&screen=documents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Click on "Avaliar" button
    const avaliarBtn = page.locator('button:has-text("Avaliar")').first();
    if (await avaliarBtn.isVisible()) {
      await avaliarBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: path.join(artifactDir, 'gsa3_modal_responsive_1366x768.png') });
    console.log('Saved: gsa3_modal_responsive_1366x768.png');
    await page.close();
  }

  // 2. Tablet Viewport (768x1024)
  {
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await page.goto('http://127.0.0.1:5180/?role=admin&screen=documents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Open modal
    const avaliarBtn = page.locator('button:has-text("Avaliar")').first();
    if (await avaliarBtn.isVisible()) {
      await avaliarBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: path.join(artifactDir, 'gsa3_modal_responsive_768x1024.png') });
    console.log('Saved: gsa3_modal_responsive_768x1024.png');
    await page.close();
  }

  // 3. Mobile Viewport (390x844) - Modal
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://127.0.0.1:5180/?role=admin&screen=documents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const avaliarBtn = page.locator('button:has-text("Avaliar")').first();
    if (await avaliarBtn.isVisible()) {
      await avaliarBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: path.join(artifactDir, 'gsa3_modal_responsive_390x844.png') });
    console.log('Saved: gsa3_modal_responsive_390x844.png');
    await page.close();
  }

  // 4. Mobile Viewport (390x844) - Dashboard
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://127.0.0.1:5180/?role=admin&screen=dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(artifactDir, 'gsa3_dashboard_responsive_390x844.png') });
    console.log('Saved: gsa3_dashboard_responsive_390x844.png');
    await page.close();
  }

  await browser.close();
  console.log('All responsive screenshots captured successfully!');
}

runCapture().catch(console.error);
