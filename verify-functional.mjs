// Функциональный смоук SAF-210/SAF-244: гейты согласий на index (ПДн + автоматические
// вызовы), демо-флоу кода, тумблер звонков ЛК (отказ/подтверждение), якоря legal.
import pkg from '../node_modules/playwright/index.js';
const { chromium } = pkg;
const BASE = 'http://127.0.0.1:8931';

// Формулировка Legal (канон SAF-244): сверяем тексты формы и ЛК дословно.
const CALLS_CONSENT_TEXT = 'Я согласен получать автоматические телефонные вызовы от сервиса SafeSky на указанный номер — для подтверждения номера и для доставки уведомлений; понимаю, что вызовы совершаются автоматически, с воспроизведением записанного сообщения. Я могу отказаться в любой момент в личном кабинете — вызовы прекращаются не позднее следующего дня.';
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let fails = 0;
const check = (name, cond, extra='') => { console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

// 1. index.html: два согласия — ПДн и автоматические вызовы (SAF-244, отдельные строки)
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.fill('#phone-input', '+7 (999) 123-45-67');
await page.click('form#connect-form button[type="submit"]');
await page.waitForTimeout(300);
const alertVisible = await page.isVisible('#connect-alert');
const alertText = await page.textContent('#connect-alert-text').catch(() => '');
check('index: submit без согласий показывает ошибку', alertVisible, alertText.trim().slice(0, 60));
check('index: текст ошибки про согласие ПДн', /согласие на обработку персональных данных/i.test(alertText));
check('index: остались на index (не перешли)', page.url().includes('index.html'));
check('index: текст согласия на вызовы соответствует Legal', norm(await page.evaluate(() => document.body.textContent)).includes(CALLS_CONSENT_TEXT));

await page.check('#consent-input');
await page.click('form#connect-form button[type="submit"]');
await page.waitForTimeout(300);
check('index: с ПДн, но без согласия на вызовы → ошибка', await page.isVisible('#connect-alert'), norm(await page.textContent('#connect-alert-text').catch(() => '')).slice(0, 60));
check('index: текст ошибки про согласие на вызовы', /согласие на автоматические вызовы/i.test(await page.textContent('#connect-alert-text').catch(() => '')));

await page.check('#calls-consent-input');
await page.click('form#connect-form button[type="submit"]');
await page.waitForTimeout(800);
check('index: с обоими согласиями переход на code.html', page.url().includes('code.html'));
check('index: телефон сохранён', await page.evaluate(() => sessionStorage.getItem('safesky.phone') === '+7 (999) 123-45-67'));
check('index: флаг согласия на вызовы сохранён', await page.evaluate(() => sessionStorage.getItem('safesky.callsConsent') === '1'));

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

// 3. lk.html: тумблер звонков по умолчанию включён, ссылка отзыва согласия
await page.goto(`${BASE}/lk.html`, { waitUntil: 'networkidle' });
const toggles = page.locator('input[type="checkbox"]');
const n = await toggles.count();
let checkedCount = 0;
for (let i = 0; i < n; i++) if (await toggles.nth(i).isChecked()) checkedCount++;
check('lk: включён только тумблер звонков по умолчанию', checkedCount === 1 && await page.isChecked('#calls-toggle'), `всего ${n}, включено ${checkedCount}`);
check('lk: ссылка отзыва согласия', (await page.locator('#revoke-consent').count()) === 1);
check('lk: ссылка отзыва ведёт на Политику', await page.evaluate(() => document.getElementById('revoke-consent')?.getAttribute('href') === 'legal.html#privacy'));
const badHash = await page.evaluate(() => [...document.querySelectorAll('a[href="#"]')].length);
check('lk: нет href="#"', badHash === 0);
check('lk: текст согласия в ЛК соответствует Legal', norm(await page.evaluate(() => document.body.textContent)).includes(CALLS_CONSENT_TEXT));

// 3b. lk.html?demo=1: отказ тумблером и повторное согласие через подтверждение (SAF-244)
await page.goto(`${BASE}/lk.html?demo=1`, { waitUntil: 'networkidle' });
await page.uncheck('#calls-toggle');
await page.waitForTimeout(300);
check('lk: отказ → статус о прекращении вызовов', /Вызовы отключены/i.test(await page.textContent('#calls-toggle-status').catch(() => '')));
check('lk: после отказа тумблер выключен', !(await page.isChecked('#calls-toggle')));
check('lk: отказ не требует подтверждения (безусловный)', !(await page.isVisible('#calls-confirm')));
await page.check('#calls-toggle');
await page.waitForTimeout(300);
check('lk: включение требует подтверждения (панель с текстом)', await page.isVisible('#calls-confirm'));
check('lk: тумблер не включён до подтверждения', !(await page.isChecked('#calls-toggle')));
check('lk: кнопка подтверждения неактивна без галочки', await page.evaluate(() => document.getElementById('calls-confirm-btn').disabled));
await page.check('#calls-confirm-check');
await page.click('#calls-confirm-btn');
await page.waitForTimeout(300);
check('lk: согласие подтверждено → тумблер включён', await page.isChecked('#calls-toggle'));
check('lk: статус «согласие зафиксировано»', /зафиксировано/i.test(await page.textContent('#calls-toggle-status').catch(() => '')));
check('lk: панель подтверждения закрыта', !(await page.isVisible('#calls-confirm')));
await page.uncheck('#calls-toggle');
await page.waitForTimeout(300);
await page.check('#calls-toggle');
await page.waitForTimeout(300);
check('lk: повторный цикл включения снова требует подтверждения', await page.isVisible('#calls-confirm'));

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
