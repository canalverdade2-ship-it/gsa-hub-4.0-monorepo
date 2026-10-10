import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const screens = {
  admin: ['dashboard','clients','orders','contracts','tasks','calendar','finance','documents','reports','catalogs','settings'],
  client: ['dashboard','profile','orders','contracts','documents','notices','finance','reports','support'],
};
fs.mkdirSync('artifacts/responsive', { recursive: true });
const failures = [];
let checked = 0;
async function check(page, name) {
  const issues = await page.evaluate(() => {
    const containers = [...document.querySelectorAll('.content-scrollable, .modal-dialog, .topbar, .mobile-bottom-nav')];
    return containers.filter(e => e.clientWidth && e.scrollWidth > e.clientWidth + 2).map(e => ({ class: e.className, width: e.clientWidth, scroll: e.scrollWidth }));
  });
  if (issues.length) failures.push({ name, issues });
  checked++;
}
try {
  for (const width of process.argv.includes('--interactions-only') ? [] : [320,390,768,1024,1366,1920]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    for (const [role, routes] of Object.entries(screens)) for (const screen of routes) {
      await page.goto(`http://127.0.0.1:5181/?role=${role}&screen=${screen}`);
      await page.locator('.content-scrollable > div').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await check(page, `${width}/${role}/${screen}`);
      if ([390,1366].includes(width) && ['orders','dashboard','support'].includes(screen)) await page.screenshot({ path: `artifacts/responsive/${role}-${screen}-${width}.png` });
    }
    await page.close();
  }
  const flows = [
    ['admin','orders', /Nova Ordem/, true],
    ['admin','orders', /Configurar Fluxo/, false],
    ['admin','clients', /Novo Cliente/, true],
    ['admin','clients', /Abrir 360/, false],
    ['admin','contracts', /Novo contrato/i, false],
    ['admin','tasks', /Nova Tarefa/, true],
    ['admin','finance', /Nova Fatura/, true],
    ['admin','documents', /Solicitar Documento/, true],
    ['client','support', /Abrir Novo Chamado/, true],
  ];
  for (const width of [320,390,768,1366]) {
    const page = await browser.newPage({ viewport: { width, height: 650 } });
    for (const [role, screen, button, modal] of flows) {
      await page.goto(`http://127.0.0.1:5181/?role=${role}&screen=${screen}`);
      const target = page.getByRole('button', { name: button }).first();
      await target.waitFor();
      // Actions at the far edge of a table remain reachable by local scrolling.
      await target.click();
      if (modal) await page.getByRole('dialog').waitFor();
      await check(page, `${width}/${role}/${screen}/${button.source}`);
      if (modal) {
        const rect = await page.getByRole('dialog').evaluate(e => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        });
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.right <= width + 1 && rect.bottom <= 651, 'Dialog must fit viewport');
      }
      if (width === 390) {
        await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
        await page.screenshot({ path: `artifacts/responsive/${role}-${screen}-${modal ? 'modal' : 'detail'}.png` });
      }
    }
    await page.goto('http://127.0.0.1:5181/?role=client&screen=dashboard');
    if (width < 1025) {
      await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
      assert.equal(await page.locator('.sidebar--open').count(), 1);
      await page.locator('.sidebar').getByRole('button', { name: 'Documentos', exact: true }).click();
      assert.equal(await page.locator('.sidebar--open').count(), 0);
      await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.sidebar--open').count(), 0);
    }
    await page.close();
  }
  console.log(JSON.stringify({ checked, failures }, null, 2));
  const report = process.argv.includes('--interactions-only') ? 'interactions-results.json' : 'results.json';
  fs.writeFileSync(`artifacts/responsive/${report}`, JSON.stringify({ checked, failures }, null, 2));
  assert.equal(failures.length, 0, 'Layout overflow detected');
} finally { await browser.close(); }

