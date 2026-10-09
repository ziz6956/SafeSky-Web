// Функциональный смоук SAF-210: гейт согласия на index, демо-флоу кода, тумблеры ЛК, якоря legal.
import pkg from '../node_modules/playwright/index.js';
const { chromium } = pkg;
const BASE = 'http://127.0.0.1:8931';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let fails = 0;
const check = (name, cond, extra='') => { console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

// 1. index.html: submit без согласия → ошибка; с согласием → переход на code.html
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.fill('#phone-input', '+7 (999) 123-45-67');
await page.click('form#connect-form button[type="submit"]');
await page.waitForTimeout(300);
const alertVisible = await page.isVisible('#connect-alert');
const alertText = await page.textContent('#connect-alert-text').catch(() => '');
check('index: submit без согласия показывает ошибку', alertVisible, alertText.trim().slice(0, 60));
check('index: текст ошибки про согласие ПДн', /согласие на обработку персональных данных/i.test(alertText));
check('index: остались на index (не перешли)', page.url().includes('index.html'));

await page.check('#consent-input');
await page.click('form#connect-form button[type="submit"]');
await page.waitForTimeout(800);
check('index: с согласием переход на code.html', page.url().includes('code.html'));
check('index: телефон сохранён', await page.evaluate(() => sessionStorage.getItem('safesky.phone') === '+7 (999) 123-45-67'));

// 2. code.html?demo=1: код 1234 (Flash Call) → success; неверный код → ошибка
await page.goto(`${BASE}/code.html?demo=1`, { waitUntil: 'networkidle' });
const cells = page.locator('.sk-otp-cell');
check('code: 4 OTP-ячейки (Flash Call)', (await cells.count()) === 4);
await cells.nth(0).fill('9'); await cells.nth(1).fill('9'); await cells.nth(2).fill('9');
await cells.nth(3).fill('9');
// форма автосабмитится на 4-й цифре (кнопка уходит в «Проверяем…»)
await page.waitForTimeout(900);
const errVisible = await page.isVisible('#code-alert');
check('code: неверный код → алерт', errVisible);
const demoPhone = await page.textContent('#phone-display');
check('code: телефон в шапке экрана', /123-45-67|123-4567|999/.test(demoPhone), demoPhone.trim());

// вводим 1234 (демо-код) — попытки обнуляем перезагрузкой (состояние в памяти)
await page.goto(`${BASE}/code.html?demo=1`, { waitUntil: 'networkidle' });
const c2 = page.locator('.sk-otp-cell');
for (const [i, ch] of '1234'.split('').entries()) await c2.nth(i).fill(ch);
await page.waitForTimeout(900);
const successVisible = await page.isVisible('#success-state');
check('code: демо-код 1234 → success', successVisible);

// 3. lk.html: тумблеры не включены по умолчанию, ссылка отзыва согласия
await page.goto(`${BASE}/lk.html`, { waitUntil: 'networkidle' });
const toggles = page.locator('input[type="checkbox"]');
const n = await toggles.count();
let checkedCount = 0;
for (let i = 0; i < n; i++) if (await toggles.nth(i).isChecked()) checkedCount++;
check('lk: ни один тумблер не включён по умолчанию', checkedCount === 0, `всего ${n}, включено ${checkedCount}`);
check('lk: ссылка отзыва согласия', (await page.locator('#revoke-consent').count()) === 1);
check('lk: ссылка отзыва ведёт на Политику', await page.evaluate(() => document.getElementById('revoke-consent')?.getAttribute('href') === 'legal.html#privacy'));
const badHash = await page.evaluate(() => [...document.querySelectorAll('a[href="#"]')].length);
check('lk: нет href="#"', badHash === 0);

// 4. legal.html: секции и якоря
await page.goto(`${BASE}/legal.html`, { waitUntil: 'networkidle' });
check('legal: #privacy', (await page.locator('#privacy').count()) === 1);
check('legal: #terms', (await page.locator('#terms').count()) === 1);
const privacyH3 = await page.locator('#privacy h3').count();
check('legal: 7 разделов Политики', privacyH3 === 7, `h3: ${privacyH3}`);
const footers = await page.evaluate(() => [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href')));
check('legal: футер → #privacy/#terms', footers.includes('#privacy') && footers.includes('#terms'), footers.join(', '));

await browser.close();
console.log(fails === 0 ? 'FUNCTIONAL: ALL PASS' : `FUNCTIONAL: ${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
