import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'C:\\Users\\Adriano Farias\\.gemini\\antigravity\\brain\\8fe38fef-42fe-47bb-87f7-ff6aea3b860c';
const DIST_DIR = path.resolve('GSA HUB 3.0/dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

async function main() {
  const PORT = 5186;
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Servidor de preview ativo em http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    // 1. Desktop Admin: OS Flow Builder (Image 1)
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?role=admin&screen=orders`);
      await page.waitForTimeout(600);
      const path1 = path.join(ARTIFACT_DIR, 'gsa3_admin_orders_1440x900.png');
      await page.screenshot({ path: path1 });
      console.log(`[OK] Capturado: ${path1}`);
      await context.close();
    }

    // 2. Desktop Admin: Novo Contrato (Image 2)
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?role=admin&screen=contracts`);
      await page.waitForTimeout(600);
      const path2 = path.join(ARTIFACT_DIR, 'gsa3_admin_contracts_1440x900.png');
      await page.screenshot({ path: path2 });
      console.log(`[OK] Capturado: ${path2}`);
      await context.close();
    }

    // 3. Desktop Client: Acompanhamento da OS (Image 3)
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?role=client&screen=orders`);
      await page.waitForTimeout(600);
      const path3 = path.join(ARTIFACT_DIR, 'gsa3_client_orders_1440x900.png');
      await page.screenshot({ path: path3 });
      console.log(`[OK] Capturado: ${path3}`);
      await context.close();
    }

    // 4. Mobile Client: Acompanhamento da OS (Image 4)
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?role=client&screen=orders`);
      await page.waitForTimeout(600);
      const path4 = path.join(ARTIFACT_DIR, 'gsa3_client_orders_390x844.png');
      await page.screenshot({ path: path4 });
      console.log(`[OK] Capturado: ${path4}`);
      await context.close();
    }

    // 5. Mobile Client: Contrato PDF & Assinatura (Image 5)
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?role=client&screen=contracts`);
      await page.waitForTimeout(600);
      const path5 = path.join(ARTIFACT_DIR, 'gsa3_client_contracts_390x844.png');
      await page.screenshot({ path: path5 });
      console.log(`[OK] Capturado: ${path5}`);
      await context.close();
    }

    console.log('\n🎉 Todas as 5 capturas de tela foram geradas com sucesso!');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(console.error);
