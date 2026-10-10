import { chromium } from 'playwright';
import path from 'path';

async function capture() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const screens = [
    { role: 'admin', screen: 'tasks', name: 'gsa3_admin_tasks_1440x900.png', w: 1440, h: 900 },
    { role: 'admin', screen: 'calendar', name: 'gsa3_admin_calendar_1440x900.png', w: 1440, h: 900 },
    { role: 'admin', screen: 'documents', name: 'gsa3_admin_documents_1440x900.png', w: 1440, h: 900 },
    { role: 'admin', screen: 'reports', name: 'gsa3_admin_reports_1440x900.png', w: 1440, h: 900 },
    { role: 'admin', screen: 'catalogs', name: 'gsa3_admin_catalogs_1440x900.png', w: 1440, h: 900 },
    { role: 'admin', screen: 'settings', name: 'gsa3_admin_settings_1440x900.png', w: 1440, h: 900 },
    { role: 'client', screen: 'documents', name: 'gsa3_client_documents_1440x900.png', w: 1440, h: 900 },
    { role: 'client', screen: 'finance', name: 'gsa3_client_finance_1440x900.png', w: 1440, h: 900 },
    { role: 'client', screen: 'support', name: 'gsa3_client_support_1440x900.png', w: 1440, h: 900 }
  ];

  const artifactDir = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';

  for (const s of screens) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto(`http://127.0.0.1:5180/?role=${s.role}&screen=${s.screen}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const dest = path.join(artifactDir, s.name);
    await page.screenshot({ path: dest });
    console.log(`Saved screenshot: ${s.name}`);
    await page.close();
  }

  await browser.close();
  console.log('All screenshots captured successfully!');
}

capture().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});
