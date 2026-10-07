// Сборка fonts.css: self-host шрифтов (Inter, Space Grotesk, Material Symbols Outlined).
// Без внешних CDN — IP посетителя не уходит за пределы РФ (SAF-210, правка 6 / L-3).
import fs from 'node:fs';

const MOCKUP = '/paperclip/instances/default/projects/7978e316-309a-4ca3-9778-6745b4399231/5f9a87cf-4cfe-4230-a602-cbdf1ef1be48/_default/design-mockups';
const subsetFont = (await import('file://' + MOCKUP + '/node_modules/subset-font/index.js')).default;

const PAGES = ['index.html', 'lk.html', 'legal.html', 'code.html', 'connected.html'];

// 1. Уникальные символы всех страниц + полные алфавиты (запас на будущие правки)
const chars = new Set();
for (const p of PAGES) for (const ch of fs.readFileSync(p, 'utf8')) {
  if (ch.codePointAt(0) > 31) chars.add(ch); // без управляющих символов
}
const CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIG = '0123456789';
const PUNCT = ' .,:;!?()[]{}\"\'«»—–…•·°№₽©®™%‰+−<=>|/\\@#$^&*~_§±≤≥→←↑↓';
for (const ch of CYR + LAT + DIG + PUNCT) chars.add(ch);
const text = [...chars].join('');
console.log('unique chars:', chars.size, '| site-only:', [...chars].filter(c => !(CYR+LAT+DIG+PUNCT).includes(c)).map(c => `U+${c.codePointAt(0).toString(16)}`).join(' '));

// 2. Inter из локальных TTF: сабсет → woff2 → base64
const INTER_FILES = {
  400: `${MOCKUP}/fonts/Inter_400Regular.ttf`,
  500: `${MOCKUP}/fonts/Inter_500Medium.ttf`,
  600: `${MOCKUP}/fonts/Inter_600SemiBold.ttf`,
  700: `${MOCKUP}/fonts/Inter_700Bold.ttf`,
};
const faces = [];
for (const [w, path] of Object.entries(INTER_FILES)) {
  const buf = fs.readFileSync(path);
  const woff2 = await subsetFont(buf, text, { targetFormat: 'woff2' });
  faces.push(`@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${woff2.toString('base64')}) format('woff2');}`);
  console.log(`Inter ${w}: ${woff2.length} bytes`);
}

// 3. Space Grotesk: Google css2 text=-сабсет (кириллица+латиница) по весам
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const enc = encodeURIComponent(text);
for (const w of [500, 600, 700]) {
  const url = `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@${w}&text=${enc}`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/gs)].map(m => m[1]);
  if (!blocks.length) throw new Error(`SG ${w}: no font-face in response`);
  for (const b of blocks) {
    const src = b.match(/src:\s*url\(([^)]+)\)/)?.[1];
    const range = b.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim();
    if (!src || !range) continue;
    const data = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
    faces.push(`@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:${w};font-display:swap;unicode-range:${range};src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');}`);
    console.log(`Space Grotesk ${w} [${range.slice(0, 40)}…]: ${data.length} bytes`);
  }
}

// 4. Material Symbols Outlined — статичный экземпляр 24/400 (единственный используемый)
const MSO_URL = 'https://fonts.gstatic.com/s/materialsymbolsoutlined/v375/kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHOej.woff2';
const mso = Buffer.from(await (await fetch(MSO_URL, { headers: { 'User-Agent': UA } })).arrayBuffer());
faces.push(`@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${mso.toString('base64')}) format('woff2');}`);
console.log('Material Symbols Outlined:', mso.length, 'bytes');

// 5. Классовые правила иконок (как у Google) + файл
const css = `/* SafeSky-Web — self-host шрифты (SAF-210, правка 6: без внешних CDN).
   Inter (сабсет из TTF), Space Grotesk (сабсет Google Fonts, OFL), Material Symbols Outlined (OFL). */
${faces.join('\n')}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
`;
fs.writeFileSync('fonts.css', css);
console.log('fonts.css bytes:', css.length);
