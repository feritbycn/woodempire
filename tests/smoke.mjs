import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || 'shot.png';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, hasTouch: true });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto(url);
await page.waitForTimeout(6000);
await page.screenshot({ path: out });
console.log(errs.slice(0, 30).join('\n'));
const info = await page.evaluate(() => window.__WE ? window.__WE.info() : 'no api');
console.log(JSON.stringify(info).slice(0, 600));
await browser.close();
