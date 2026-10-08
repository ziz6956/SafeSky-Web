// Аудит покрытия классов: каждый класс из DOM финальных страниц должен иметь
// правило в tailwind.css (union) / styles.css / fonts.css. Tailwind Play CDN
// экранирует запятые как \2c/\, — канонизируем обе стороны до сравнения.
import pkg from '../node_modules/playwright/index.js';
import fs from 'node:fs';
const { chromium } = pkg;

const BASE = 'http://127.0.0.1:8931';
const PAGES = ['index.html', 'code.html', 'connected.html', 'lk.html', 'legal.html', 'shader.html'];

const canon = (s) => s.replace(/\\2c[ ]?/g, ',').replace(/\\,/g, ',').replace(/\\/g, '');
const pool = ['tailwind.css', 'styles.css', 'fonts.css']
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const poolC = canon(pool);

// JS-хуки без CSS: faq-* (аккордеон FAQ), group (без group-* вариантов), dot/peer (структурные), dark (html)
const EXCLUDE = new Set(['peer', 'dark', 'dot', 'group', 'faq-item', 'faq-trigger', 'faq-content']);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
let total = 0, missingAll = 0;
for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/${name}`, { waitUntil: 'networkidle', timeout: 30000 });
  if (name === 'lk.html') {
    await page.click('#lk-add-hub').catch(() => {});
    await page.waitForTimeout(700); // renderList создаёт кнопки picker'а
  }
  const tokens = await page.evaluate(() => {
    const set = new Set();
    for (const el of document.querySelectorAll('*')) for (const c of el.classList) set.add(c);
    return [...set];
  });
  const missing = tokens.filter((t) => !EXCLUDE.has(t) && !poolC.includes('.' + t));
  total += tokens.length;
  missingAll += missing.length;
  console.log(`[${name}] tokens=${tokens.length}, missing=${missing.length}`);
  if (missing.length) console.log('  ' + missing.join(' '));
  await page.close();
}
await browser.close();
console.log(missingAll === 0 ? `AUDIT: ALL COVERED (${total} tokens)` : `AUDIT: ${missingAll} MISSING of ${total}`);
process.exit(missingAll === 0 ? 0 : 1);
