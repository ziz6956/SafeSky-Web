// Извлечение скомпилированного Tailwind CSS из страниц (Play CDN компилирует в браузере).
// Результат: union CSS всех страниц → tailwind.css (статический, без внешних CDN).
import pkg from '../node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8931';
const PAGES = ['index.html', 'lk.html', 'legal.html', 'code.html', 'connected.html'];

// Динамические классы из JS-обработчиков (могут отсутствовать в исходном DOM)
const SWEEP_CLASSES = [
  'bg-status-active', 'flex', 'hidden', 'opacity-50', 'rotate-180', 'text-status-active',
  'animate-ping', 'bg-status-alert/10', 'bg-surface-container-low', 'border-border-crisp',
  'border-status-alert/50', 'pointer-events-none', 'animate-spin', 'opacity-40',
];

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const perPage = [];
for (const name of PAGES) {
  await page.goto(`${BASE}/${name}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.tailwind && typeof window.tailwind === 'object', null, { timeout: 15000 }).catch(() => {});
  // сметаем динамические классы в скрытый div — MutationObserver CDN их скомпилирует
  await page.evaluate((cls) => {
    const div = document.createElement('div');
    div.id = 'sweep-dyn';
    div.className = cls.join(' ');
    div.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(div);
  }, SWEEP_CLASSES);
  await page.waitForTimeout(1200);
  const styles = await page.evaluate(() => {
    const out = [];
    for (const st of document.querySelectorAll('style')) {
      const t = st.textContent || '';
      if (t.includes('@layer base{html,body')) continue; // инлайновый базовый style страницы
      if (t.trim()) out.push(t);
    }
    return out;
  });
  perPage.push({ name, styles });
  console.log(`[${name}] style tags captured: ${styles.length}, total chars: ${styles.reduce((a, s) => a + s.length, 0)}`);
}
await browser.close();

// Объединение (дедуп по содержимому, сохраняем порядок)
const seen = new Set();
const merged = [];
for (const { name, styles } of perPage) {
  for (const s of styles) {
    if (!seen.has(s)) { seen.add(s); merged.push(s); }
  }
}
const css = merged.join('\n');
fs.writeFileSync('tailwind.css', css);
console.log('union CSS bytes:', css.length, '| blocks:', merged.length);
// слойный заголовок Play CDN обычно в первом блоке — проверяем
console.log('first 120 chars:', JSON.stringify(css.slice(0, 120)));
