// Верификация self-host сборки: загрузка 5 страниц, ошибки консоли, сеть, шрифты, стили.
import pkg from '../node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://127.0.0.1:8931';
const PAGES = ['index.html', 'lk.html', 'legal.html', 'code.html', 'connected.html', 'shader.html'];
// shader.html — canvas без текстовых узлов: семейства не загружаются, проверка шрифтов не применима.
const SKIP_FONTS = new Set(['shader.html']);
// На 127.0.0.1 страница локальная → боевой режим → fetch на localhost:3000 (нет бэкенда).
// На Pages страница НЕ локальная и демо включается сам — ?demo=1 воспроизводит опубликованное поведение.
const DEMO_PAGES = new Set(['code.html', 'lk.html']);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
let failures = 0;

for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  const badResponses = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  page.on('response', r => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${BASE}/${name}${DEMO_PAGES.has(name) ? '?demo=1' : ''}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  const ext = await page.evaluate(() =>
    [...document.querySelectorAll('link,script[src],img[src]')]
      .map(n => n.href || n.src).filter(u => u && !u.startsWith('http://127.0.0.1') && !u.startsWith('data:')));

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const probe = (fam) => {
      const f = (new Set([...document.fonts]).values().next().value);
      for (const face of document.fonts) if (face.family === fam && face.status === 'loaded') return true;
      return false;
    };
    return {
      inter: probe('Inter'),
      sg: probe('Space Grotesk'),
      mso: probe('Material Symbols Outlined'),
    };
  });

  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const h1 = document.querySelector('h1');
    const btn = document.querySelector('button');
    return {
      bodyBg: body.backgroundColor,
      h1Font: h1 ? getComputedStyle(h1).fontFamily : null,
      btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
    };
  });

  const ok = consoleErrors.length === 0 && badResponses.length === 0 && ext.length === 0
    && (SKIP_FONTS.has(name) || (fonts.inter && fonts.sg && fonts.mso));
  if (!ok) failures++;
  console.log(`[${name}] ${ok ? 'PASS' : 'FAIL'}`);
  if (consoleErrors.length) console.log('  console:', consoleErrors.join(' | '));
  if (badResponses.length) console.log('  network:', badResponses.join(' | '));
  if (ext.length) console.log('  external refs:', ext.join(' | '));
  console.log(`  fonts: ${JSON.stringify(fonts)}`);
  console.log(`  styles: ${JSON.stringify(styles)}`);
  await page.close();
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
