// SAF-210 правка 6: замена внешних CDN на self-host в head всех страниц.
// - удалить все <link> на https://fonts.g...
// - удалить <script src="https://cdn.tailwindcss.com/3.4.17">
// - удалить <script id="tailwind-config">...</script> (ссылается на глобал tailwind)
// - вставить <link fonts.css> + <link tailwind.css> перед styles.css
import fs from 'node:fs';

const PAGES = ['index.html', 'lk.html', 'legal.html', 'code.html', 'connected.html'];

for (const f of PAGES) {
  let h = fs.readFileSync(f, 'utf8');
  const before = h;

  // 1. Google-ссылки (любые варианты)
  h = h.replace(/<link [^>]*href="https:\/\/fonts\.g[^"]*"[^>]*\/?>\s*/g, '');
  if (/fonts\.g/.test(h)) throw new Error(`${f}: остались ссылки на fonts.g`);

  // 2. CDN Tailwind
  h = h.replace(/<script src="https:\/\/cdn\.tailwindcss\.com\/[^"]*"><\/script>\s*/g, '');
  if (/cdn\.tailwindcss\.com/.test(h)) throw new Error(`${f}: остался CDN tailwindcss`);

  // 3. Инлайн-конфиг Play CDN (от <script id="tailwind-config"> до ближайшего </script>)
  const cfgStart = h.indexOf('<script id="tailwind-config">');
  if (cfgStart === -1) throw new Error(`${f}: нет <script id="tailwind-config">`);
  const cfgEnd = h.indexOf('</script>', cfgStart);
  h = h.slice(0, cfgStart) + h.slice(cfgEnd + '</script>'.length);
  if (/tailwind-config/.test(h)) throw new Error(`${f}: остался tailwind-config`);

  // 4. Вставка self-host ресурсов перед styles.css
  const anchor = '<link href="styles.css" rel="stylesheet"/>';
  if (!h.includes(anchor)) throw new Error(`${f}: нет якоря styles.css`);
  h = h.replace(anchor, '<link href="fonts.css" rel="stylesheet"/><link href="tailwind.css" rel="stylesheet"/>' + anchor);

  if (h === before) throw new Error(`${f}: файл не изменился — скрипт не сработал`);
  fs.writeFileSync(f, h);
  console.log(`${f}: ok, ${before.length - h.length} chars removed`);
}
