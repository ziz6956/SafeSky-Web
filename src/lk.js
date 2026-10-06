'use strict';

const K = require('./svgkit');
const { C } = require('./theme');
const { LK } = require('./content');

/**
 * Личный кабинет: единый интерфейс для всех пользователей — без ролей, сегментов
 * и вариантов A/B/C (`structure` §2, решение D2).
 * 4 раздела: События · Настройки · Тарифы · Подписка.
 */

const D = { w: 1440, pad: 56, headH: 74, bannerH: 48, cardR: 18, contentMax: 1080 };
const M = { w: 390, pad: 18, cardR: 16, headH: 56, bannerH: 42, tabH: 76 };

/* ---------- общие куски ---------- */

function statusTone(tone) {
  const map = {
    green: { bg: C.greenBg, fg: C.green },
    amber: { bg: C.amberBg, fg: C.amber },
    alert: { bg: C.alertBg, fg: C.alert },
    neutral: { bg: C.bg3, fg: C.ink2 },
  };
  return map[tone] || map.neutral;
}

/** Точка-статус + подпись. */
function statusLine(x, y, label, tone) {
  const t = statusTone(tone);
  return K.circle(x + 5, y - 4, 5, { fill: t.fg }) + K.textBlock({ x: x + 18, y, text: label, size: 14, weight: 600, color: t.fg }).svg;
}

/** Тумблер. */
function roundToggle(x, y, w, on) {
  const h = 30;
  const knob = 22;
  return (
    K.roundRect(x, y, w, h, h / 2, { fill: on ? C.green : C.bg3 }) +
    K.circle(x + (on ? w - knob / 2 - 4 : knob / 2 + 4), y + h / 2, knob / 2, { fill: '#FFFFFF' })
  );
}

/** Переключатель «период» — чипы в ряд. */
function chipRow(x, y, labels, firstOn, opts = {}) {
  const s = [];
  const spots = [];
  let cx = x;
  labels.forEach((l, i) => {
    const c = K.chip(cx, y, l, {
      tone: i === (firstOn ? 0 : -1) ? 'blue' : 'neutral',
      size: opts.size || 13,
      h: opts.h || 34,
      padX: opts.padX || 14,
    });
    s.push(c.svg);
    cx += c.w + (opts.gap || 10);
  });
  return { svg: s.join(''), w: cx - x, spots };
}

/* ---------- Desktop: шапка с горизонтальным меню ---------- */

function headerDesktop(active, opts = {}) {
  // Новый ЛК (`structure` SAF-180 § 3) не разбит на разделы, поэтому на нём нет
  // меню разделов: состав шапки — открытый вопрос Q1 (`structure` § 3.4).
  const showNav = opts.showNav !== false;
  const exitTo = opts.exitTo || null;
  const s = [];
  const spots = [];
  const H = D.headH;
  s.push(K.rect(0, 0, D.w, H, { fill: '#FFFFFF' }));
  s.push(K.icon('shield', D.pad, (H - 26) / 2, 26, C.navy700, 1.8));
  s.push(K.textBlock({ x: D.pad + 36, y: H / 2 + 6, text: LK.brand, size: 18, weight: 700, color: C.ink }).svg);

  // горизонтальное меню разделов
  let tx = D.pad + 190;
  s.push(K.line(0, H, D.w, H, C.line));
  if (showNav) {
    for (const n of LK.nav) {
      const on = n.id === active;
      const tw = Math.round(K.measure(n.label, 15, on ? 700 : 500)) + 34;
      s.push(
        K.textBlock({ x: tx + 17, y: H / 2 + 6, text: n.label, size: 15, weight: on ? 700 : 500, color: on ? C.navy800 : C.ink2 }).svg,
      );
      if (on) s.push(K.rect(tx + 10, H - 3, tw - 20, 3, { fill: C.navy700, rx: 2 }));
      spots.push({ x: tx, y: 0, w: tw, h: H, to: 'lk-' + n.id, label: n.label });
      tx += tw + 6;
    }
  } else {
    s.push(K.textBlock({ x: tx, y: H / 2 + 6, text: LK.airport.h1, size: 15, weight: 700, color: C.navy800 }).svg);
  }

  // правая группа: чип тарифа, помощь, выход
  const exW = Math.round(K.measure(LK.exit, 14, 600)) + 40;
  const exX = D.w - D.pad - exW;
  s.push(K.button(exX, (H - 40) / 2, exW, 40, LK.exit, 'secondary', 14));
  const hx = exX - 18 - 32;
  s.push(K.circle(hx + 16, H / 2, 16, { fill: C.bg3 }));
  s.push(K.textBlock({ x: hx + 16, y: H / 2 + 6, text: LK.help, size: 15, weight: 700, color: C.ink2, anchor: 'middle' }).svg);
  const chip = K.chip(0, 0, LK.tariffChip, { tone: 'blue', size: 12.5, h: 28, padX: 12 });
  const chX = hx - 18 - chip.w;
  s.push(K.group([chip.svg], `translate(${chX},${(H - 28) / 2})`));
  // Выход из ЛК — один клик из шапки (`structure` SAF-180 § 3.4: не глубже второго клика).
  // Хотспот вешаем только на новый экран, чтобы не менять карту переходов прежних экранов.
  if (exitTo) spots.push({ x: exX, y: (H - 40) / 2, w: exW, h: 40, to: exitTo, label: LK.exit });

  // плашка честного статуса (`structure` §2.0)
  s.push(K.rect(0, H, D.w, D.bannerH, { fill: C.blue50 }));
  s.push(K.line(0, H + D.bannerH, D.w, H + D.bannerH, C.line2));
  s.push(K.icon('clock', D.pad, H + (D.bannerH - 18) / 2, 18, C.navy700, 1.8));
  s.push(
    K.textBlock({ x: D.pad + 28, y: H + D.bannerH / 2 + 5, text: LK.statusBanner, size: 13.5, weight: 600, color: C.navy800 }).svg,
  );
  s.push(
    K.textBlock({
      x: D.pad + 28 + K.measure(LK.statusBanner, 13.5, 600) + 14,
      y: H + D.bannerH / 2 + 5,
      text: 'Аккаунт: ' + LK.account.region + ' · ' + LK.account.phone,
      size: 13,
      color: C.muted,
    }).svg,
  );
  return { svg: s.join(''), h: H + D.bannerH, spots };
}

/* Отступ подзаголовка считаем от низа выносных элементов заголовка, а не от
   «1.2*size»: для заголовка 30px это давало строку подзаголовка на y+46, и нижние
   выносные элементы заголовка («р», «й») сталкивались с верхом подзаголовка. */
const DESC = 0.25;
const ASC = 0.78;
const SUB_GAP = 6; // визуальный зазор между низом заголовка и верхом подзаголовка

function pageHead(x, y, w, h1, sub) {
  const s = [];
  const size = 30;
  const subSize = 15;
  const subLh = 23;
  const a = K.textBlock({ x, y: y + size, text: h1, size, weight: 700, color: C.ink, maxWidth: w, lh: 40 });
  s.push(a.svg);
  let h = a.lines.length * 40;
  if (sub) {
    // Округляем до целых: дробная базовая линия даёт дробную высоту кадра
    // (1086.2px), и при экспорте в 2x текст мылится на полпикселя.
    const base = Math.round(size + DESC * size + SUB_GAP + ASC * subSize);
    const b = K.textBlock({ x, y: y + base, text: sub, size: subSize, color: C.muted, maxWidth: Math.min(w, 720), lh: subLh });
    s.push(b.svg);
    h = base + (b.lines.length - 1) * subLh + Math.round(subSize * 1.2);
  }
  return { svg: s.join(''), h };
}

/* ---------- Desktop: 2.1 История событий ---------- */

function historyDesktop(x0, y0, w) {
  const s = [];
  const spots = [];
  let y = y0;
  const head = pageHead(x0, y, w, LK.history.h1, LK.history.sub);
  s.push(head.svg);
  y += head.h + 24;

  // фильтры: период + канал доставки
  const p = chipRow(x0, y, LK.history.filterPeriod, true, { h: 36 });
  s.push(p.svg);
  const dx = x0 + p.w + 8;
  s.push(K.line(dx, y + 8, dx, y + 28, C.line));
  const c = chipRow(dx + 14, y, LK.history.filterChannel, true, { h: 36 });
  s.push(c.svg);
  y += 36 + 20;

  // таблица
  const thH = 46;
  const rowH = 96;
  const tableH = thH + LK.history.rows.length * rowH;
  s.push(K.roundRect(x0, y, w, tableH, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.roundRect(x0, y, w, thH * 2, D.cardR, { fill: C.bg2, stroke: C.line2 }));
  s.push(K.rect(x0 + 1, y + thH - 1, w - 2, thH + 1, { fill: C.bg2 }));
  s.push(K.line(x0, y + thH, x0 + w, y + thH, C.line2));

  const padX = 32;
  const cv = [210, 250, 190, w - padX * 2 - 650];
  let tx = x0 + padX;
  LK.history.cols.forEach((t, i) => {
    s.push(K.textBlock({ x: tx, y: y + 29, text: t, size: 12, weight: 600, color: C.muted, ls: 0.5 }).svg);
    tx += cv[i];
  });

  let ry = y + thH;
  LK.history.rows.forEach((r, i) => {
    s.push(K.textBlock({ x: x0 + padX, y: ry + 38, text: r.date, size: 14, weight: 600, color: C.ink, maxWidth: cv[0] - 12, lh: 20 }).svg);
    s.push(K.textBlock({ x: x0 + padX + cv[0], y: ry + 38, text: r.region, size: 14, color: C.ink2, maxWidth: cv[1] - 12, lh: 20 }).svg);
    s.push(K.chip(x0 + padX + cv[0] + cv[1], ry + 24, r.status, { tone: r.tone, size: 12.5, h: 30, padX: 12 }).svg);
    const ax = x0 + padX + cv[0] + cv[1] + cv[2];
    s.push(K.textBlock({ x: ax, y: ry + 24, text: r.action, size: 13.5, color: C.ink2, maxWidth: cv[3], lh: 20 }).svg);
    if (r.status === 'Подтверждено') {
      s.push(K.textBlock({ x: ax, y: ry + 66, text: LK.history.feedback, size: 12.5, weight: 600, color: C.navy600 }).svg);
      s.push(K.line(ax, ry + 68, ax + K.measure(LK.history.feedback, 12.5, 600), ry + 68, C.navy600));
    }
    if (i < LK.history.rows.length - 1) s.push(K.line(x0 + padX, ry + rowH, x0 + w - padX, ry + rowH, C.line2));
    ry += rowH;
  });
  y += tableH + 18;

  // Пояснение статуса + срок хранения. Обе строки идут в одну колонку друг под другом:
  // при side-by-side правая (срок хранения) наезжала на первую строку пояснения.
  const noteX = x0 + 54;
  const noteW = w - 54 - 24;
  const nt = K.textBlock({ x: noteX, y: y + 26, text: LK.history.note, size: 13, color: C.navy800, maxWidth: noteW, lh: 19 });
  const rt = K.textBlock({ x: noteX, y: y + 26 + nt.height + 8, text: LK.history.retention, size: 12.5, color: C.muted, maxWidth: noteW, lh: 18 });
  const noteH = 26 + nt.height + 8 + rt.height + 14;
  s.push(K.roundRect(x0, y, w, noteH, 14, { fill: C.blue50 }));
  s.push(K.icon('clock', x0 + 20, y + 22, 22, C.navy700, 1.8));
  s.push(nt.svg);
  s.push(rt.svg);
  y += noteH + 20;

  s.push(K.button(x0, y, 200, 48, LK.history.more, 'secondary', 14.5));
  y += 48;
  return { svg: s.join(''), h: y - y0 + 8, spots };
}

/* ---------- Desktop: 2.2 Настройки ---------- */

function settingsDesktop(x0, y0, w) {
  const s = [];
  const spots = [];
  const cw = Math.min(w, D.contentMax);
  let y = y0;
  const head = pageHead(x0, y, cw, LK.settings.h1, null);
  s.push(head.svg);
  y += head.h + 26;
  const padX = 30;
  const actW = 132;

  // --- Телефон и каналы ---
  const rows1 = [
    { label: LK.settings.phoneField, value: LK.settings.phoneValue, action: 'Изменить' },
    { label: LK.settings.botRow, value: LK.settings.botState, toggle: true },
    ...LK.settings.toggles.map((t) => ({ label: t.label, toggle: true, on: t.on })),
  ];
  let h1 = 66 + rows1.length * 76;
  s.push(K.roundRect(x0, y, cw, h1, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x0 + padX, y: y + 42, text: LK.settings.phoneSection, size: 16, weight: 700, color: C.ink }).svg);
  let ry = y + 66;
  rows1.forEach((r) => {
    s.push(K.line(x0 + padX, ry, x0 + cw - padX, ry, C.line2));
    s.push(K.textBlock({ x: x0 + padX, y: ry + 34, text: r.label, size: 15, weight: 500, color: C.ink, maxWidth: cw - padX * 2 - actW - 40 }).svg);
    if (r.value) {
      s.push(K.textBlock({ x: x0 + padX, y: ry + 58, text: r.value, size: 14, weight: 600, color: C.ink2 }).svg);
    }
    if (r.toggle) s.push(roundToggle(x0 + cw - padX - 52, ry + 24, 52, r.on !== false));
    if (r.action) s.push(K.button(x0 + cw - padX - actW, ry + 18, actW, 40, r.action, 'secondary', 13.5));
    ry += 76;
  });
  y += h1 + 16;

  // --- Регион ---
  const h2 = 168;
  s.push(K.roundRect(x0, y, cw, h2, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x0 + padX, y: y + 42, text: LK.settings.regionSection, size: 16, weight: 700, color: C.ink }).svg);
  s.push(K.line(x0 + padX, y + 66, x0 + cw - padX, y + 66, C.line2));
  s.push(K.textBlock({ x: x0 + padX, y: y + 96, text: LK.settings.regionField, size: 15, weight: 500, color: C.ink }).svg);
  s.push(K.textBlock({ x: x0 + padX, y: y + 122, text: LK.settings.regionValue, size: 13.5, color: C.ink2, maxWidth: cw - padX * 2 - actW - 60 }).svg);
  s.push(K.textBlock({ x: x0 + padX, y: y + 148, text: LK.settings.regionNote, size: 12.5, color: C.muted, maxWidth: cw - padX * 2, lh: 18 }).svg);
  s.push(K.button(x0 + cw - padX - actW, y + 80, actW, 40, 'Изменить', 'secondary', 13.5));
  y += h2 + 16;

  // --- Согласия ---
  const h3 = 90 + LK.settings.consents.length * 78 + 56;
  s.push(K.roundRect(x0, y, cw, h3, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x0 + padX, y: y + 42, text: LK.settings.consentsSection, size: 16, weight: 700, color: C.ink }).svg);
  let cy = y + 86;
  LK.settings.consents.forEach((c) => {
    s.push(K.line(x0 + padX, cy, x0 + cw - padX, cy, C.line2));
    s.push(K.textBlock({ x: x0 + padX, y: cy + 34, text: c.label, size: 15, weight: 500, color: C.ink, maxWidth: cw - padX * 2 - 340 }).svg);
    s.push(statusLine(x0 + padX, cy + 60, c.state, 'green'));
    s.push(K.textBlock({ x: x0 + padX + 190, y: cy + 60, text: c.date, size: 13, color: C.muted }).svg);
    if (c.revoke) s.push(K.button(x0 + cw - padX - actW, cy + 26, actW, 40, 'Отозвать', 'danger', 13.5));
    cy += 78;
  });
  s.push(K.line(x0 + padX, cy, x0 + cw - padX, cy, C.line2));
  s.push(K.textBlock({ x: x0 + padX, y: cy + 30, text: LK.settings.consentsNote, size: 13, color: C.muted, maxWidth: cw - padX * 2, lh: 20 }).svg);
  y += h3 + 16;

  // --- Управление ---
  const h4 = 250;
  s.push(K.roundRect(x0, y, cw, h4, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x0 + padX, y: y + 42, text: LK.settings.manageSection, size: 16, weight: 700, color: C.ink }).svg);
  s.push(K.line(x0 + padX, y + 66, x0 + cw - padX, y + 66, C.line2));
  s.push(K.icon('clock', x0 + padX, y + 92, 20, C.ink2, 1.8));
  s.push(K.textBlock({ x: x0 + padX + 34, y: y + 106, text: LK.settings.pause, size: 15, weight: 600, color: C.ink }).svg);
  s.push(K.textBlock({ x: x0 + cw - padX - 420, y: y + 106, text: 'Звонки останавливаются до включения', size: 13, color: C.muted, maxWidth: 380, anchor: 'end' }).svg);
  s.push(K.button(x0 + cw - padX - actW, y + 88, actW, 40, 'Пауза', 'secondary', 13.5));
  s.push(K.line(x0 + padX, y + 142, x0 + cw - padX, y + 142, C.line2));
  s.push(K.icon('cross', x0 + padX, y + 166, 20, C.alert, 1.8));
  s.push(K.textBlock({ x: x0 + padX + 34, y: y + 180, text: LK.settings.unsubscribe, size: 15, weight: 600, color: C.alert }).svg);
  s.push(K.button(x0 + cw - padX - actW, y + 162, actW, 40, 'Отписаться', 'danger', 13.5));
  s.push(K.textBlock({ x: x0 + padX, y: y + 226, text: LK.settings.manageNote, size: 12.5, color: C.muted, maxWidth: cw - padX * 2, lh: 18 }).svg);
  y += h4 + 18;
  s.push(K.textBlock({ x: x0, y: y + 12, text: LK.settings.phoneNote, size: 12.5, color: C.muted2, maxWidth: cw, lh: 18 }).svg);
  y += 34;
  return { svg: s.join(''), h: y - y0 + 8, spots };
}

/* ---------- Desktop: 2.3 Тарифы ---------- */

function tariffDesktop(x0, y0, w) {
  const s = [];
  const spots = [];
  const cw = Math.min(w, D.contentMax);
  let y = y0;
  const head = pageHead(x0, y, cw, LK.tariff.h1, LK.tariff.sub);
  s.push(head.svg);
  y += head.h + 26;

  const gap = 18;
  const pw = (cw - gap * 3) / 4;
  const ph = 330;
  LK.tariff.plans.forEach((p, i) => {
    const px = x0 + i * (pw + gap);
    const cur = p.state === 'current';
    s.push(K.roundRect(px, y, pw, ph, D.cardR, { fill: cur ? '#FFFFFF' : C.bg2, stroke: cur ? C.navy600 : C.line2, 'stroke-width': cur ? 2 : 1 }));
    s.push(K.textBlock({ x: px + 22, y: y + 44, text: p.name, size: 14.5, weight: 700, color: cur ? C.navy800 : C.ink2 }).svg);
    s.push(K.textBlock({ x: px + 22, y: y + 92, text: p.price, size: 32, weight: 700, color: cur ? C.ink : C.muted }).svg);
    if (cur) s.push(K.chip(px + pw - 22 - 104, y + 26, p.cta, { tone: 'green', size: 11, h: 26, padX: 10 }).svg);
    s.push(K.line(px + 22, y + 118, px + pw - 22, y + 118, C.line2));
    s.push(K.textBlock({ x: px + 22, y: y + 148, text: p.d, size: 13.5, color: cur ? C.ink2 : C.muted, maxWidth: pw - 44, lh: 21 }).svg);
    const bY = y + ph - 62;
    const bw = pw - 44;
    if (cur) {
      s.push(K.roundRect(px + 22, bY, bw, 44, 22, { fill: C.bg3 }));
      s.push(K.textBlock({ x: px + 22 + bw / 2, y: bY + 28, text: p.cta, size: 13.5, weight: 600, color: C.ink2, anchor: 'middle' }).svg);
    } else {
      s.push(K.button(px + 22, bY, bw, 44, p.cta, 'primary', 13.5));
    }
  });
  y += ph + 20;

  s.push(K.textBlock({ x: x0, y: y + 12, text: LK.tariff.payNote, size: 13, weight: 600, color: C.navy700 }).svg);
  y += 36;
  LK.tariff.notes.forEach((n) => {
    const t = K.textBlock({ x: x0 + 18, y: y + 9, text: n, size: 12.5, color: C.muted, maxWidth: cw - 18, lh: 19 });
    s.push(K.icon('shield', x0, y - 1, 13, C.muted2, 1.7));
    s.push(t.svg);
    y += t.height + 9;
  });
  y += 6;
  return { svg: s.join(''), h: y - y0 + 8, spots };
}

/* ---------- Desktop: 2.4 Подписка ---------- */

function subscriptionDesktop(x0, y0, w) {
  const s = [];
  const spots = [];
  const cw = Math.min(w, 760);
  let y = y0;
  const head = pageHead(x0, y, cw, LK.subscription.h1, null);
  s.push(head.svg);
  y += head.h + 26;
  const padX = 30;

  // тариф и статус
  const c1 = 206;
  s.push(K.roundRect(x0, y, cw, c1, D.cardR, { fill: C.navy900 }));
  s.push(K.textBlock({ x: x0 + padX, y: y + 46, text: LK.subscription.tariffRow[0], size: 12.5, weight: 600, color: C.blue200, ls: 0.4 }).svg);
  s.push(K.textBlock({ x: x0 + padX, y: y + 88, text: LK.subscription.tariffRow[1], size: 30, weight: 700, color: '#FFFFFF' }).svg);
  const sx = x0 + cw - padX;
  s.push(K.textBlock({ x: sx, y: y + 46, text: LK.subscription.statusRow[0], size: 12.5, weight: 600, color: C.blue200, ls: 0.4, anchor: 'end' }).svg);
  const st = K.chip(0, 0, LK.subscription.statusRow[1], { tone: LK.subscription.statusTone, size: 12.5, h: 30, padX: 12 });
  s.push(K.group([st.svg], `translate(${sx - st.w},${y + 60})`));
  s.push(K.line(x0 + padX, y + 126, x0 + cw - padX, y + 126, 'rgba(255,255,255,0.16)'));
  // Строка использования — своей строкой над шкалой: шкала во всю ширину
  // пересекала текст и перекрывала его хвост.
  s.push(K.textBlock({ x: x0 + padX, y: y + 158, text: LK.subscription.usage, size: 14, weight: 600, color: '#E7EEFC' }).svg);
  const frac = (() => {
    const m = /: (\d+) из (\d+)/.exec(LK.subscription.usage);
    return m ? Number(m[1]) / Number(m[2]) : 0;
  })();
  const barW = cw - padX * 2;
  s.push(K.roundRect(x0 + padX, y + 176, barW, 8, 4, { fill: 'rgba(255,255,255,0.18)' }));
  s.push(K.roundRect(x0 + padX, y + 176, Math.max(8, barW * frac), 8, 4, { fill: C.blue400 }));
  y += c1 + 12;
  s.push(K.textBlock({ x: x0, y: y + 14, text: LK.subscription.usageNote, size: 13, color: C.muted, maxWidth: cw, lh: 20 }).svg);
  y += 40 + 18;

  // списания
  const c2 = 118;
  s.push(K.roundRect(x0, y, cw, c2, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x0 + padX, y: y + 44, text: 'Платежи', size: 16, weight: 700, color: C.ink }).svg);
  s.push(K.line(x0 + padX, y + 62, x0 + cw - padX, y + 62, C.line2));
  s.push(K.textBlock({ x: x0 + padX, y: y + 94, text: LK.subscription.charge, size: 14, color: C.ink2 }).svg);
  y += c2 + 16;

  // действия
  const c3 = 214;
  s.push(K.roundRect(x0, y, cw, c3, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  const bw = (cw - padX * 2 - 14) / 2;
  s.push(K.button(x0 + padX, y + 28, bw, 50, LK.subscription.cta1, 'primary', 15));
  spots.push({ x: x0 + padX, y: y + 28, w: bw, h: 50, to: 'lk-tariff', label: LK.subscription.cta1 });
  s.push(K.button(x0 + padX + bw + 14, y + 28, bw, 50, LK.subscription.cta2, 'danger', 15));
  s.push(K.line(x0 + padX, y + 102, x0 + cw - padX, y + 102, C.line2));
  s.push(K.textBlock({ x: x0 + padX, y: y + 132, text: LK.subscription.cancelNote, size: 13.5, color: C.ink2, maxWidth: cw - padX * 2, lh: 20 }).svg);
  s.push(K.textBlock({ x: x0 + padX, y: y + 174, text: LK.subscription.fz376Note, size: 13, color: C.muted, maxWidth: cw - padX * 2, lh: 20 }).svg);
  y += c3 + 10;
  return { svg: s.join(''), h: y - y0 + 8, spots };
}

/* ---------- Desktop: 2.1b пустое состояние ---------- */

function emptyDesktop(x0, y0, w) {
  const s = [];
  const spots = [];
  const cw = Math.min(w, D.contentMax);
  let y = y0;
  const head = pageHead(x0, y, cw, LK.empty.h1, LK.empty.sub);
  s.push(head.svg);
  y += head.h + 26;

  const ch = 430;
  s.push(K.roundRect(x0, y, cw, ch, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  const cx = x0 + cw / 2;
  s.push(K.circle(cx, y + 124, 46, { fill: C.blue50 }));
  s.push(K.icon('list', cx - 24, y + 100, 48, C.navy600, 1.6));
  s.push(K.textBlock({ x: cx, y: y + 212, text: LK.empty.title, size: 22, weight: 700, color: C.ink, anchor: 'middle' }).svg);
  const d = K.textBlock({ x: cx, y: y + 246, text: LK.empty.text, size: 15, color: C.muted, maxWidth: 560, lh: 24, anchor: 'middle' });
  s.push(d.svg);
  const ctaY = y + 246 + d.height + 12;
  s.push(K.button(cx - 116, ctaY, 232, 52, LK.empty.cta, 'primary', 15));
  spots.push({ x: cx - 116, y: ctaY, w: 232, h: 52, to: 'lk-settings', label: LK.empty.cta });
  const n = K.textBlock({ x: cx, y: ctaY + 84, text: LK.empty.next, size: 13, color: C.muted2, maxWidth: 560, lh: 19, anchor: 'middle' });
  s.push(n.svg);
  y += ch;
  return { svg: s.join(''), h: y - y0 + 8, spots };
}

/* ---------- Новый ЛК: аэропорт (structure SAF-180 § 3; texts SAF-177 § 5) ---------- */

/** Readonly-поле: значение серым по bg2, замок, без рамки фокуса (изменить нельзя). */
function readonlyField(x, y, w, h, value) {
  const s = [];
  s.push(K.roundRect(x, y, w, h, 12, { fill: C.bg2, stroke: C.line }));
  s.push(K.icon('lock', x + 14, y + (h - 18) / 2, 18, C.muted, 1.8));
  s.push(K.textBlock({ x: x + 42, y: y + h / 2 + 6, text: value, size: 15.5, weight: 600, color: C.ink2 }).svg);
  return s.join('');
}

/** Селектор (выпадающий список). Возвращает { svg, box } — по box прототип кладёт <select>. */
function selectField(x, y, w, h, value) {
  const s = [];
  s.push(K.roundRect(x, y, w, h, 12, { fill: '#FFFFFF', stroke: C.navy600, 'stroke-width': 1.6 }));
  s.push(K.textBlock({ x: x + 16, y: y + h / 2 + 6, text: value, size: 15.5, weight: 500, color: C.ink }).svg);
  // шеврон
  const cxp = x + w - 26;
  const cyp = y + h / 2;
  s.push(K.path(`M${cxp - 6} ${cyp - 3}l6 6 6-6`, { fill: 'none', stroke: C.navy700, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return { svg: s.join(''), box: { x, y, w, h } };
}

function cardFrame(x, y, w, h, title, h3 = 62) {
  const s = [];
  s.push(K.roundRect(x, y, w, h, D.cardR, { fill: '#FFFFFF', stroke: C.line }));
  if (title) {
    s.push(K.textBlock({ x: x + 20, y: y + 34, text: title, size: 15, weight: 700, color: C.ink }).svg);
    s.push(K.line(x + 20, y + h3, x + w - 20, y + h3, C.line2));
  }
  return s.join('');
}

/** Карточка «Учётная запись»: readonly-номер + селектор аэропорта + дисклеймер. */
function accountCard(x, y, w) {
  const A = LK.airport;
  const s = [];
  const p = 20;
  const iw = w - p * 2;
  const h = 396;
  s.push(cardFrame(x, y, w, h, 'Учётная запись'));
  let cy = y + 62 + 22;

  s.push(K.textBlock({ x: x + p, y: cy + 4, text: A.phoneLabel, size: 13, weight: 600, color: C.ink }).svg);
  cy += 14;
  s.push(readonlyField(x + p, cy, iw, 52, A.phoneValue));
  cy += 52 + 18;
  const pn = K.textBlock({ x: x + p, y: cy + 4, text: A.phoneNote, size: 12, color: C.muted, maxWidth: iw, lh: 17 });
  s.push(pn.svg);
  cy += pn.height + 22;

  s.push(K.textBlock({ x: x + p, y: cy + 4, text: A.airportLabel, size: 13, weight: 600, color: C.ink }).svg);
  cy += 14;
  const sel = selectField(x + p, cy, iw, 52, A.airportValue);
  s.push(sel.svg);
  cy += 52 + 20;
  const hint = K.textBlock({ x: x + p, y: cy + 4, text: A.airportHint, size: 12, color: C.muted, maxWidth: iw, lh: 17 });
  s.push(hint.svg);
  cy += hint.height + 20;

  // Обязательный дисклеймер (texts SAF-177 § 5.2) — в основном тексте, не сноской
  const d = K.textBlock({ x: x + p + 32, y: cy + 18, text: A.airportDisclaimer, size: 12, color: C.ink2, maxWidth: iw - 46, lh: 17 });
  const dh = d.height + 30;
  s.push(K.roundRect(x + p, cy, iw, dh, 10, { fill: C.amberBg, stroke: C.amberLine }));
  s.push(K.icon('shield', x + p + 11, cy + 12, 17, C.amber, 1.8));
  s.push(d.svg);
  return { svg: s.join(''), h, select: { x: sel.box.x, y: sel.box.y, w: sel.box.w, h: sel.box.h } };
}

/** Карточка «Звонки»: тумблер (по умолчанию ВЫКЛ) + пояснение по ст. 44.1-1. */
function callsCard(x, y, w) {
  const A = LK.airport;
  const s = [];
  const p = 20;
  const iw = w - p * 2;
  const h = 216;
  s.push(cardFrame(x, y, w, h, 'Звонки'));
  let cy = y + 62 + 24;

  const label = K.textBlock({ x: x + p, y: cy + 4, text: A.toggleLabel, size: 14.5, weight: 600, color: C.ink, maxWidth: iw - 76, lh: 21 });
  s.push(label.svg);
  const tw = 52;
  const tx = x + p + iw - tw;
  const ty = cy - 14;
  s.push(roundToggle(tx, ty, tw, A.toggleDefault));
  const toggle = { x: tx - 6, y: ty - 5, w: tw + 12, h: 40 };
  cy += Math.max(label.height, 30) + 12;

  const off = K.textBlock({ x: x + p, y: cy + 4, text: A.toggleOffNote, size: 12.5, color: C.ink2, maxWidth: iw, lh: 18 });
  s.push(off.svg);
  const note = { x: x + p, y: cy - 2, w: iw, h: off.height + 6 };
  cy += off.height + 18;

  const n = K.textBlock({ x: x + p + 30, y: cy + 14, text: A.toggleNote, size: 11.5, color: C.muted, maxWidth: iw - 44, lh: 16 });
  const nh = n.height + 26;
  s.push(K.roundRect(x + p, cy, iw, nh, 10, { fill: C.bg2, stroke: C.line }));
  s.push(K.icon('bell', x + p + 9, cy + 10, 16, C.navy700, 1.8));
  s.push(n.svg);
  return { svg: s.join(''), h, toggle, note };
}

/** Карточка «Статус аэропорта»: заглушка + три значения + источник. */
function statusCard(x, y, w) {
  const A = LK.airport;
  const s = [];
  const p = 20;
  const iw = w - p * 2;
  const h = 250;
  s.push(cardFrame(x, y, w, h, A.statusH));
  let cy = y + 62 + 26;

  const badge = K.chip(0, 0, A.status, { tone: A.statusTone, size: 15, h: 38, padX: 18 });
  s.push(K.group([badge.svg], `translate(${x + p},${cy - 12})`));
  s.push(K.textBlock({ x: x + p + badge.w + 14, y: cy + 10, text: A.updated, size: 12, color: C.muted }).svg);
  cy += 44;

  // Три возможных значения — справка для FE и проверки состояний
  const vals = [
    { l: 'Норма', tone: 'green', color: C.green },
    { l: 'Задержки', tone: 'amber', color: C.amber },
    { l: 'Ограничения', tone: 'alert', color: C.alert },
  ];
  let vx = x + p;
  for (const v of vals) {
    const c = K.chip(vx, cy, v.l, { tone: v.tone, size: 12, h: 28, padX: 11 });
    s.push(c.svg);
    vx += c.w + 8;
  }
  cy += 28 + 20;

  const n = K.textBlock({ x: x + p, y: cy + 4, text: A.statusNote, size: 12, color: C.muted, maxWidth: iw, lh: 17 });
  s.push(n.svg);
  cy += n.height + 14;
  s.push(K.textBlock({ x: x + p, y: cy + 4, text: A.sourceLink, size: 12, weight: 500, color: C.navy600, maxWidth: iw }).svg);
  const lw = K.measure(A.sourceLink, 12, 500);
  s.push(K.line(x + p, cy + 6, x + p + lw, cy + 6, C.navy600));
  return { svg: s.join(''), h, source: { x: x + p, y: cy - 12, w: Math.round(lw), h: 26 } };
}

/** Карточка «Документы»: постоянный доступ к Политике и Оферте (ч. 2 ст. 18.1 152-ФЗ). */
function docsCard(x, y, w) {
  const A = LK.airport;
  const s = [];
  const p = 20;
  const iw = w - p * 2;
  const h = 172;
  s.push(cardFrame(x, y, w, h, A.docsTitle));
  let cy = y + 62 + 20;
  A.docs.forEach((d) => {
    s.push(K.textBlock({ x: x + p, y: cy + 4, text: d.label, size: 13.5, weight: 500, color: C.navy600, maxWidth: iw - 150 }).svg);
    s.push(K.textBlock({ x: x + p + iw, y: cy + 4, text: d.state, size: 11.5, color: C.muted2, anchor: 'end' }).svg);
    cy += 26;
    s.push(K.line(x + p, cy, x + p + iw, cy, C.line2));
    cy += 14;
  });
  const n = K.textBlock({ x: x + p, y: cy + 4, text: A.docsNote, size: 11.5, color: C.muted, maxWidth: iw, lh: 16 });
  s.push(n.svg);
  return { svg: s.join(''), h };
}

/** Desktop: новый ЛК — две колонки карточек. */
function airportDesktop(x0, y0, w) {
  const s = [];
  const spots = [];
  const A = LK.airport;
  const cw = Math.min(w, 1080);
  let y = y0;
  const head = pageHead(x0, y, cw, A.h1, A.sub);
  s.push(head.svg);
  y += head.h + 26;

  const gap = 24;
  const colW = (cw - gap) / 2;
  const left = accountCard(x0, y, colW);
  const right1 = callsCard(x0 + colW + gap, y, colW);
  const right2 = statusCard(x0 + colW + gap, y + right1.h + gap, colW);
  const docs = docsCard(x0, y + left.h + gap, colW);
  s.push(left.svg, right1.svg, right2.svg, docs.svg);

  const exitN = K.textBlock({ x: x0 + colW + gap, y: y + right1.h + gap + right2.h + 26, text: A.exitNote, size: 12, color: C.muted, maxWidth: colW, lh: 17 });
  s.push(exitN.svg);

  // Ссылка на источник — заглушка; ведёт на лендинг, чтобы в прототипе не было «мёртвой» зоны
  spots.push({ x: right2.source.x, y: right2.source.y, w: right2.source.w, h: right2.source.h, to: 'landing', label: A.sourceLink });

  const bottom = Math.max(y + left.h + gap + docs.h, y + right1.h + gap + right2.h + 60);
  return {
    svg: s.join(''),
    h: bottom - y0 + 8,
    spots,
    controls: [
      { kind: 'select', name: 'airport', label: A.airportLabel, options: A.airportOptions, ...left.select },
      { kind: 'toggle', name: 'calls', note: 'calls-note', label: A.toggleLabel, ...right1.toggle },
      { kind: 'note', name: 'calls-note', off: A.toggleOffNote, on: A.toggleOnNote, ...right1.note },
    ],
  };
}

/* ---------- Desktop: сборка ---------- */

function buildLkDesktop(screen) {
  const body =
    screen === 'history'
      ? historyDesktop
      : screen === 'settings'
        ? settingsDesktop
        : screen === 'tariff'
          ? tariffDesktop
          : screen === 'subscription'
            ? subscriptionDesktop
            : screen === 'airport'
              ? airportDesktop
              : emptyDesktop;

  const active = screen === 'empty' ? 'history' : screen;
  const x0 = (D.w - Math.min(D.w - D.pad * 2, D.contentMax)) / 2;
  const cw = Math.min(D.w - D.pad * 2, D.contentMax);
  const top = D.headH + D.bannerH + 40;
  const probe = body(x0, 0, cw);
  const totalH = Math.max(top + probe.h + 72, 900);
  const content = body(x0, top, cw);
  const hd = headerDesktop(active, { showNav: screen !== 'airport', exitTo: screen === 'airport' ? 'landing' : null });
  return {
    svg: K.svgOpen(D.w, totalH, C.bg2) + content.svg + hd.svg + '</svg>',
    spots: [...(content.spots || []), ...hd.spots],
    controls: content.controls || [],
    w: D.w,
    h: totalH,
  };
}

/* ---------- Mobile: шапка + табы ---------- */

function mobileHeader() {
  const s = [];
  s.push(K.rect(0, 0, M.w, M.headH, { fill: '#FFFFFF' }));
  s.push(K.line(0, M.headH, M.w, M.headH, C.line));
  s.push(K.icon('shield', M.pad, (M.headH - 20) / 2, 20, C.navy700, 1.8));
  s.push(K.textBlock({ x: M.pad + 28, y: M.headH / 2 + 5, text: LK.brand, size: 15, weight: 700, color: C.ink }).svg);
  const chip = K.chip(0, 0, LK.tariffChip, { tone: 'blue', size: 11, h: 24, padX: 9 });
  s.push(K.group([chip.svg], `translate(${M.w - M.pad - chip.w - 34},${(M.headH - 24) / 2})`));
  s.push(K.textBlock({ x: M.w - M.pad - 4, y: M.headH / 2 + 6, text: LK.help, size: 14, weight: 700, color: C.ink2, anchor: 'end' }).svg);

  // плашка честного статуса
  s.push(K.rect(0, M.headH, M.w, M.bannerH, { fill: C.blue50 }));
  s.push(K.line(0, M.headH + M.bannerH, M.w, M.headH + M.bannerH, C.line2));
  s.push(K.icon('clock', M.pad, M.headH + (M.bannerH - 15) / 2, 15, C.navy700, 1.8));
  s.push(K.textBlock({ x: M.pad + 23, y: M.headH + M.bannerH / 2 + 4, text: LK.statusBanner, size: 12, weight: 600, color: C.navy800 }).svg);
  return { svg: s.join(''), h: M.headH + M.bannerH };
}

function mobileTabs(active, y) {
  const s = [];
  const spots = [];
  s.push(K.rect(0, y, M.w, M.tabH, { fill: '#FFFFFF' }));
  s.push(K.line(0, y, M.w, y, C.line));
  const cw = (M.w - M.pad * 2) / LK.nav.length;
  LK.nav.forEach((it, i) => {
    const on = it.id === active;
    const cx = M.pad + i * cw + cw / 2;
    s.push(K.icon(it.icon, cx - 10, y + 14, 20, on ? C.navy700 : C.muted2, 1.9));
    s.push(
      K.textBlock({ x: cx, y: y + 52, text: it.label, size: 10.5, weight: on ? 700 : 500, color: on ? C.navy800 : C.muted2, anchor: 'middle' }).svg,
    );
    spots.push({ x: M.pad + i * cw, y, w: cw, h: M.tabH, to: 'lk-' + it.id, label: 'Таб «' + it.label + '»' });
  });
  return { svg: s.join(''), spots };
}

/* ---------- Mobile: экраны ---------- */

function mobileHead(x0, y0, w, h1, sub) {
  const s = [];
  const size = 22;
  const subSize = 13.5;
  const subLh = 20;
  const a = K.textBlock({ x: x0, y: y0 + 24, text: h1, size, weight: 700, color: C.ink, maxWidth: w, lh: 30 });
  s.push(a.svg);
  let h = a.lines.length * 30;
  if (sub) {
    const base = Math.round(24 + DESC * size + SUB_GAP + ASC * subSize);
    const b = K.textBlock({ x: x0, y: y0 + base, text: sub, size: subSize, color: C.muted, maxWidth: w, lh: subLh });
    s.push(b.svg);
    h = base + (b.lines.length - 1) * subLh + Math.round(subSize * 1.2);
  }
  return { svg: s.join(''), h };
}

function historyMobile(x0, y0, w) {
  const s = [];
  let y = y0;
  const head = mobileHead(x0, y, w, LK.history.h1, LK.history.sub);
  s.push(head.svg);
  y += head.h + 16;

  const p = chipRow(x0, y, LK.history.filterPeriod, true, { h: 34, size: 12.5, padX: 12, gap: 8 });
  s.push(p.svg);
  y += 34 + 8;
  const c = chipRow(x0, y, LK.history.filterChannel, true, { h: 34, size: 12.5, padX: 12, gap: 8 });
  s.push(c.svg);
  y += 34 + 16;

  LK.history.rows.forEach((r) => {
    const h = r.status === 'Подтверждено' ? 132 : 112;
    s.push(K.roundRect(x0, y, w, h, M.cardR, { fill: '#FFFFFF', stroke: C.line }));
    s.push(K.textBlock({ x: x0 + 16, y: y + 32, text: r.date, size: 13.5, weight: 700, color: C.ink }).svg);
    s.push(K.chip(x0 + w - 16 - K.measure(r.status, 11, 600) - 20, y + 16, r.status, { tone: r.tone, size: 11, h: 24, padX: 10 }).svg);
    s.push(K.textBlock({ x: x0 + 16, y: y + 56, text: r.region, size: 12.5, color: C.muted }).svg);
    s.push(K.textBlock({ x: x0 + 16, y: y + 84, text: r.action, size: 12.5, color: C.ink2, maxWidth: w - 32, lh: 19 }).svg);
    if (r.status === 'Подтверждено') {
      s.push(K.textBlock({ x: x0 + 16, y: y + 116, text: LK.history.feedback, size: 12, weight: 600, color: C.navy600 }).svg);
    }
    y += h + 10;
  });

  const note = K.textBlock({ x: x0, y: y + 16, text: LK.history.note, size: 12, color: C.muted, maxWidth: w, lh: 18 });
  s.push(note.svg);
  y += note.height + 8;
  s.push(K.textBlock({ x: x0, y: y + 12, text: LK.history.retention, size: 11.5, color: C.muted2, maxWidth: w, lh: 17 }).svg);
  y += 30;
  s.push(K.button(x0, y, w, 50, LK.history.more, 'secondary', 14.5));
  y += 50;
  return { svg: s.join(''), h: y - y0 + 6 };
}

function settingsMobile(x0, y0, w) {
  const s = [];
  const spots = [];
  let y = y0;
  const head = mobileHead(x0, y, w, LK.settings.h1, null);
  s.push(head.svg);
  y += head.h + 18;

  const card = (yy, title, h) => {
    s.push(K.roundRect(x0, yy, w, h, M.cardR, { fill: '#FFFFFF', stroke: C.line }));
    s.push(K.textBlock({ x: x0 + 16, y: yy + 34, text: title, size: 15, weight: 700, color: C.ink }).svg);
  };

  // Телефон и каналы
  const rows = [
    { label: LK.settings.phoneField, value: LK.settings.phoneValue, action: 'Изменить' },
    { label: LK.settings.botRow, value: LK.settings.botState, toggle: true },
    ...LK.settings.toggles.map((t) => ({ label: t.label, toggle: true, on: t.on })),
  ];
  const h1 = 62 + rows.length * 74;
  card(y, LK.settings.phoneSection, h1);
  let ry = y + 62;
  rows.forEach((r) => {
    s.push(K.line(x0 + 16, ry, x0 + w - 16, ry, C.line2));
    s.push(K.textBlock({ x: x0 + 16, y: ry + 30, text: r.label, size: 14, weight: 500, color: C.ink, maxWidth: w - 100, lh: 19 }).svg);
    if (r.value) s.push(K.textBlock({ x: x0 + 16, y: ry + 52, text: r.value, size: 13, weight: 600, color: C.ink2 }).svg);
    if (r.toggle) s.push(roundToggle(x0 + w - 16 - 52, ry + 22, 52, r.on !== false));
    if (r.action) s.push(K.textBlock({ x: x0 + w - 16, y: ry + 30, text: r.action, size: 13, weight: 600, color: C.navy700, anchor: 'end' }).svg);
    ry += 74;
  });
  y += h1 + 10;

  // Регион. Высоту карточки считаем по примечанию: жёсткие 132px при переносе
  // «Регион меняется вручную.» на вторую строку обрезали её кромкой карточки.
  const note = K.textBlock({ x: x0 + 16, y: 0, text: LK.settings.regionNote, size: 11.5, maxWidth: w - 32, lh: 17 });
  const h2 = 116 + note.height + 10;
  card(y, LK.settings.regionSection, h2);
  s.push(K.line(x0 + 16, y + 62, x0 + w - 16, y + 62, C.line2));
  s.push(K.textBlock({ x: x0 + 16, y: y + 92, text: LK.settings.regionValue, size: 14, weight: 600, color: C.ink, maxWidth: w - 110 }).svg);
  s.push(K.textBlock({ x: x0 + 16, y: y + 116, text: LK.settings.regionNote, size: 11.5, color: C.muted, maxWidth: w - 32, lh: 17 }).svg);
  s.push(K.textBlock({ x: x0 + w - 16, y: y + 92, text: 'Изменить', size: 13, weight: 600, color: C.navy700, anchor: 'end' }).svg);
  y += h2 + 10;

  // Согласия
  const h3 = 62 + LK.settings.consents.length * 84 + 50;
  card(y, LK.settings.consentsSection, h3);
  let cy = y + 62;
  LK.settings.consents.forEach((c) => {
    s.push(K.line(x0 + 16, cy, x0 + w - 16, cy, C.line2));
    s.push(K.textBlock({ x: x0 + 16, y: cy + 28, text: c.label, size: 13.5, weight: 500, color: C.ink, maxWidth: w - 32, lh: 19 }).svg);
    s.push(statusLine(x0 + 16, cy + 54, c.state, 'green'));
    // Дату ставим по измеренной ширине статуса: жёсткие x0+110 при «Действует»
    // (75px, начинается на x0+34) давали зазор 0,8px — читалось как «Действует12.10.2026».
    const stateW = K.measure(c.state, 14, 600, 0);
    s.push(K.textBlock({ x: x0 + 16 + 18 + stateW + 12, y: cy + 54, text: c.date, size: 12, color: C.muted }).svg);
    if (c.revoke) s.push(K.textBlock({ x: x0 + w - 16, y: cy + 54, text: 'Отозвать', size: 12.5, weight: 600, color: C.alert, anchor: 'end' }).svg);
    cy += 84;
  });
  s.push(K.textBlock({ x: x0 + 16, y: cy + 4, text: LK.settings.consentsNote, size: 11.5, color: C.muted, maxWidth: w - 32, lh: 17 }).svg);
  y += h3 + 10;

  // Управление
  const h4 = 214;
  card(y, LK.settings.manageSection, h4);
  s.push(K.line(x0 + 16, y + 62, x0 + w - 16, y + 62, C.line2));
  s.push(K.textBlock({ x: x0 + 16, y: y + 92, text: LK.settings.pause, size: 14, weight: 600, color: C.ink }).svg);
  s.push(K.button(x0 + 16, y + 106, w - 32, 44, 'Пауза', 'secondary', 13.5));
  s.push(K.line(x0 + 16, y + 162, x0 + w - 16, y + 162, C.line2));
  s.push(K.textBlock({ x: x0 + 16, y: y + 188, text: LK.settings.unsubscribe, size: 14, weight: 600, color: C.alert }).svg);
  y += h4;
  s.push(K.textBlock({ x: x0, y: y + 16, text: LK.settings.manageNote, size: 11.5, color: C.muted, maxWidth: w, lh: 17 }).svg);
  y += 34;
  s.push(K.textBlock({ x: x0, y: y + 12, text: LK.settings.phoneNote, size: 11.5, color: C.muted2, maxWidth: w, lh: 17 }).svg);
  y += 30;
  return { svg: s.join(''), h: y - y0 + 6, spots };
}

function tariffMobile(x0, y0, w) {
  const s = [];
  const spots = [];
  let y = y0;
  const head = mobileHead(x0, y, w, LK.tariff.h1, LK.tariff.sub);
  s.push(head.svg);
  y += head.h + 16;

  LK.tariff.plans.forEach((p) => {
    const cur = p.state === 'current';
    const h = 216;
    s.push(K.roundRect(x0, y, w, h, M.cardR, { fill: cur ? '#FFFFFF' : C.bg2, stroke: cur ? C.navy600 : C.line2, 'stroke-width': cur ? 2 : 1 }));
    s.push(K.textBlock({ x: x0 + 18, y: y + 36, text: p.name, size: 14, weight: 700, color: cur ? C.navy800 : C.ink2 }).svg);
    if (cur) s.push(K.chip(x0 + w - 18 - 96, y + 18, p.cta, { tone: 'green', size: 10.5, h: 24, padX: 9 }).svg);
    s.push(K.textBlock({ x: x0 + 18, y: y + 78, text: p.price, size: 28, weight: 700, color: cur ? C.ink : C.muted }).svg);
    s.push(K.line(x0 + 18, y + 98, x0 + w - 18, y + 98, C.line2));
    s.push(K.textBlock({ x: x0 + 18, y: y + 124, text: p.d, size: 12.5, color: cur ? C.ink2 : C.muted, maxWidth: w - 36, lh: 19 }).svg);
    const bY = y + h - 58;
    if (cur) {
      s.push(K.roundRect(x0 + 18, bY, w - 36, 42, 21, { fill: C.bg3 }));
      s.push(K.textBlock({ x: x0 + w / 2, y: bY + 27, text: p.cta, size: 13, weight: 600, color: C.ink2, anchor: 'middle' }).svg);
    } else {
      s.push(K.button(x0 + 18, bY, w - 36, 42, p.cta, 'primary', 13));
    }
    y += h + 10;
  });

  s.push(K.textBlock({ x: x0, y: y + 12, text: LK.tariff.payNote, size: 12, weight: 600, color: C.navy700 }).svg);
  y += 32;
  LK.tariff.notes.forEach((n) => {
    const t = K.textBlock({ x: x0 + 16, y: y + 8, text: n, size: 11.5, color: C.muted, maxWidth: w - 16, lh: 17 });
    s.push(K.icon('shield', x0, y - 1, 12, C.muted2, 1.7));
    s.push(t.svg);
    y += t.height + 8;
  });
  y += 4;
  return { svg: s.join(''), h: y - y0 + 6, spots };
}

function subscriptionMobile(x0, y0, w) {
  const s = [];
  const spots = [];
  let y = y0;
  const head = mobileHead(x0, y, w, LK.subscription.h1, null);
  s.push(head.svg);
  y += head.h + 18;

  const c1 = 178;
  s.push(K.roundRect(x0, y, w, c1, M.cardR, { fill: C.navy900 }));
  s.push(K.textBlock({ x: x0 + 20, y: y + 38, text: LK.subscription.tariffRow[0], size: 11.5, weight: 600, color: C.blue200, ls: 0.4 }).svg);
  s.push(K.textBlock({ x: x0 + 20, y: y + 74, text: LK.subscription.tariffRow[1], size: 24, weight: 700, color: '#FFFFFF' }).svg);
  const st = K.chip(0, 0, LK.subscription.statusRow[1], { tone: LK.subscription.statusTone, size: 11.5, h: 26, padX: 10 });
  s.push(K.group([st.svg], `translate(${x0 + w - 20 - st.w},${y + 56})`));
  s.push(K.line(x0 + 20, y + 100, x0 + w - 20, y + 100, 'rgba(255,255,255,0.16)'));
  s.push(K.textBlock({ x: x0 + 20, y: y + 130, text: LK.subscription.usage, size: 13, weight: 600, color: '#E7EEFC', maxWidth: w - 40, lh: 19 }).svg);
  s.push(K.roundRect(x0 + 20, y + 148, w - 40, 8, 4, { fill: 'rgba(255,255,255,0.18)' }));
  s.push(K.roundRect(x0 + 20, y + 148, w - 40, 8, 4, { fill: C.blue400 }));
  y += c1 + 10;
  s.push(K.textBlock({ x: x0, y: y + 12, text: LK.subscription.usageNote, size: 11.5, color: C.muted, maxWidth: w, lh: 17 }).svg);
  y += 34 + 14;

  const c2 = 108;
  s.push(K.roundRect(x0, y, w, c2, M.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x0 + 16, y: y + 34, text: 'Платежи', size: 14.5, weight: 700, color: C.ink }).svg);
  s.push(K.line(x0 + 16, y + 50, x0 + w - 16, y + 50, C.line2));
  s.push(K.textBlock({ x: x0 + 16, y: y + 80, text: LK.subscription.charge, size: 13, color: C.ink2, maxWidth: w - 32, lh: 19 }).svg);
  y += c2 + 10;

  const c3 = 196;
  s.push(K.roundRect(x0, y, w, c3, M.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.button(x0 + 16, y + 20, w - 32, 48, LK.subscription.cta1, 'primary', 14.5));
  spots.push({ x: x0 + 16, y: y + 20, w: w - 32, h: 48, to: 'lk-tariff', label: LK.subscription.cta1 });
  s.push(K.button(x0 + 16, y + 78, w - 32, 48, LK.subscription.cta2, 'danger', 14.5));
  s.push(K.line(x0 + 16, y + 142, x0 + w - 16, y + 142, C.line2));
  s.push(K.textBlock({ x: x0 + 16, y: y + 168, text: LK.subscription.cancelNote, size: 11.5, color: C.ink2, maxWidth: w - 32, lh: 17 }).svg);
  y += c3 + 10;
  s.push(K.textBlock({ x: x0 + 16, y: y + 8, text: LK.subscription.fz376Note, size: 11.5, color: C.muted, maxWidth: w - 32, lh: 17 }).svg);
  y += 30;
  return { svg: s.join(''), h: y - y0 + 6, spots };
}

function emptyMobile(x0, y0, w) {
  const s = [];
  const spots = [];
  let y = y0;
  const head = mobileHead(x0, y, w, LK.empty.h1, LK.empty.sub);
  s.push(head.svg);
  y += head.h + 16;

  const cx = x0 + w / 2;
  const textSize = 13;
  const textLh = 20;
  const ctaH = 50;
  const nextSize = 11.5;
  const nextLh = 17;
  // Высоту карточки считаем по содержимому: жёсткие 388px давали примечанию
  // лечь на кнопку (примечание рисовалось после кнопки и перечёркивало её край).
  const d = K.textBlock({ x: cx, y: 0, text: LK.empty.text, size: textSize, maxWidth: w - 52, lh: textLh, anchor: 'middle' });
  const ctaY = y + 214 + d.height + 12;
  // 20px до базовой линии = ~11px визуального зазора до верхних выносных примечания
  const nextY = ctaY + ctaH + 20;
  const n = K.textBlock({ x: cx, y: 0, text: LK.empty.next, size: nextSize, maxWidth: w - 52, lh: nextLh, anchor: 'middle' });
  const h = nextY - y + (n.lines.length - 1) * nextLh + Math.round(nextSize * 1.2) + 18;

  s.push(K.roundRect(x0, y, w, h, M.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.circle(cx, y + 104, 42, { fill: C.blue50 }));
  s.push(K.icon('list', cx - 22, y + 82, 44, C.navy600, 1.6));
  s.push(K.textBlock({ x: cx, y: y + 182, text: LK.empty.title, size: 19, weight: 700, color: C.ink, anchor: 'middle' }).svg);
  s.push(K.group([d.svg], `translate(0,${y + 214})`));
  s.push(K.button(x0 + 18, ctaY, w - 36, ctaH, LK.empty.cta, 'primary', 14.5));
  spots.push({ x: x0 + 18, y: ctaY, w: w - 36, h: ctaH, to: 'lk-settings', label: LK.empty.cta });
  s.push(K.group([n.svg], `translate(0,${nextY})`));
  y += h;
  return { svg: s.join(''), h: y - y0 + 6, spots };
}

/** Mobile: новый ЛК — те же карточки в одну колонку. */
function airportMobile(x0, y0, w) {
  const s = [];
  const spots = [];
  const A = LK.airport;
  let y = y0;
  const head = mobileHead(x0, y, w, A.h1, A.sub);
  s.push(head.svg);
  y += head.h + 16;

  const gap = 12;
  const left = accountMobile(x0, y, w);
  const calls = callsMobile(x0, y + left.h + gap, w);
  const status = statusMobile(x0, y + left.h + gap + calls.h + gap, w);
  const docs = docsMobile(x0, y + left.h + gap + calls.h + gap + status.h + gap, w);
  s.push(left.svg, calls.svg, status.svg, docs.svg);

  // Ссылка на источник — заглушка; ведёт на лендинг, чтобы в прототипе не было «мёртвой» зоны
  spots.push({ x: status.source.x, y: status.source.y, w: status.source.w, h: status.source.h, to: 'landing', label: A.sourceLink });

  return {
    svg: s.join(''),
    h: y - y0 + left.h + gap + calls.h + gap + status.h + gap + docs.h,
    spots,
    controls: [
      { kind: 'select', name: 'airport', label: A.airportLabel, options: A.airportOptions, ...left.select },
      { kind: 'toggle', name: 'calls', note: 'calls-note', label: A.toggleLabel, ...calls.toggle },
      { kind: 'note', name: 'calls-note', off: A.toggleOffNote, on: A.toggleOnNote, ...calls.note },
    ],
  };
}

function cardFrameM(x, y, w, h, title, h3 = 54) {
  const s = [];
  s.push(K.roundRect(x, y, w, h, M.cardR, { fill: '#FFFFFF', stroke: C.line }));
  s.push(K.textBlock({ x: x + 16, y: y + 30, text: title, size: 14, weight: 700, color: C.ink }).svg);
  s.push(K.line(x + 16, y + h3, x + w - 16, y + h3, C.line2));
  return s.join('');
}

function accountMobile(x0, y0, w) {
  const A = LK.airport;
  const s = [];
  const p = 16;
  const iw = w - p * 2;
  let cy = y0 + 54 + 18;
  // высоту считаем по содержимому: дисклеймер на 390px занимает 4 строки
  const pn = K.textBlock({ x: x0 + p, y: 0, text: A.phoneNote, size: 11.5, color: C.muted, maxWidth: iw, lh: 16 });
  const hint = K.textBlock({ x: x0 + p, y: 0, text: A.airportHint, size: 11.5, color: C.muted, maxWidth: iw, lh: 16 });
  const d = K.textBlock({ x: x0 + p + 28, y: 0, text: A.airportDisclaimer, size: 11.5, color: C.ink2, maxWidth: iw - 40, lh: 16 });
  const h = cy - y0 + 14 + 48 + 16 + pn.height + 20 + 14 + 48 + 18 + hint.height + 18 + d.height + 28 + p;

  s.push(cardFrameM(x0, y0, w, h, 'Учётная запись'));
  s.push(K.textBlock({ x: x0 + p, y: cy + 4, text: A.phoneLabel, size: 12.5, weight: 600, color: C.ink }).svg);
  cy += 12;
  s.push(K.roundRect(x0 + p, cy, iw, 48, 11, { fill: C.bg2, stroke: C.line }));
  s.push(K.icon('lock', x0 + p + 12, cy + 15, 17, C.muted, 1.8));
  s.push(K.textBlock({ x: x0 + p + 38, y: cy + 29, text: A.phoneValue, size: 14.5, weight: 600, color: C.ink2 }).svg);
  cy += 48 + 16;
  s.push(K.group([pn.svg], `translate(0,${cy})`));
  cy += pn.height + 20;

  s.push(K.textBlock({ x: x0 + p, y: cy + 4, text: A.airportLabel, size: 12.5, weight: 600, color: C.ink }).svg);
  cy += 12;
  const sel = selectField(x0 + p, cy, iw, 48, A.airportValue);
  s.push(sel.svg);
  cy += 48 + 18;
  s.push(K.group([hint.svg], `translate(0,${cy})`));
  cy += hint.height + 18;

  s.push(K.roundRect(x0 + p, cy, iw, d.height + 28, 10, { fill: C.amberBg, stroke: C.amberLine }));
  s.push(K.icon('shield', x0 + p + 10, cy + 11, 16, C.amber, 1.8));
  s.push(K.group([d.svg], `translate(0,${cy + 14})`));
  // геометрия селектора — в координатах экрана
  return { svg: s.join(''), h, select: sel.box };
}

function callsMobile(x0, y0, w) {
  const A = LK.airport;
  const s = [];
  const p = 16;
  const iw = w - p * 2;
  const label = K.textBlock({ x: x0 + p, y: 0, text: A.toggleLabel, size: 13.5, weight: 600, color: C.ink, maxWidth: iw - 66, lh: 20 });
  const off = K.textBlock({ x: x0 + p, y: 0, text: A.toggleOffNote, size: 12, color: C.ink2, maxWidth: iw, lh: 17 });
  const n = K.textBlock({ x: x0 + p + 28, y: 0, text: A.toggleNote, size: 11.5, color: C.muted, maxWidth: iw - 40, lh: 16 });
  const h = 54 + 20 + Math.max(label.height, 30) + 12 + off.height + 16 + n.height + 30 + p;

  s.push(cardFrameM(x0, y0, w, h, 'Звонки'));
  let cy = y0 + 54 + 22;
  s.push(K.group([label.svg], `translate(0,${cy})`));
  const tw = 48;
  const tx = x0 + p + iw - tw;
  const ty = cy - 12;
  s.push(roundToggle(tx, ty, tw, A.toggleDefault));
  cy += Math.max(label.height, 30) + 12;
  const note = { x: x0 + p, y: cy - 2, w: iw, h: off.height + 6 };
  s.push(K.group([off.svg], `translate(0,${cy})`));
  cy += off.height + 16;
  s.push(K.roundRect(x0 + p, cy, iw, n.height + 26, 10, { fill: C.bg2, stroke: C.line }));
  s.push(K.icon('bell', x0 + p + 9, cy + 10, 15, C.navy700, 1.8));
  s.push(K.group([n.svg], `translate(0,${cy + 13})`));
  return { svg: s.join(''), h, toggle: { x: tx - 8, y: ty - 5, w: tw + 16, h: 40 }, note };
}

function statusMobile(x0, y0, w) {
  const A = LK.airport;
  const s = [];
  const p = 16;
  const iw = w - p * 2;
  const n = K.textBlock({ x: x0 + p, y: 0, text: A.statusNote, size: 11.5, color: C.muted, maxWidth: iw, lh: 16 });
  const srcW = Math.round(K.measure(A.sourceLink, 11.5, 500));
  const h = 54 + 20 + 34 + 6 + 26 + 18 + n.height + 16 + 20 + p;

  s.push(cardFrameM(x0, y0, w, h, A.statusH));
  let cy = y0 + 54 + 20;
  const badge = K.chip(x0 + p, cy, A.status, { tone: A.statusTone, size: 14, h: 34, padX: 16 });
  s.push(badge.svg);
  s.push(K.textBlock({ x: x0 + p + badge.w + 12, y: cy + 22, text: A.updated, size: 11, color: C.muted }).svg);
  cy += 34 + 6;
  let vx = x0 + p;
  for (const v of [
    { l: 'Норма', tone: 'green' },
    { l: 'Задержки', tone: 'amber' },
    { l: 'Ограничения', tone: 'alert' },
  ]) {
    const c = K.chip(vx, cy, v.l, { tone: v.tone, size: 11, h: 26, padX: 10 });
    s.push(c.svg);
    vx += c.w + 6;
  }
  cy += 26 + 18;
  s.push(K.group([n.svg], `translate(0,${cy})`));
  cy += n.height + 16;
  s.push(K.textBlock({ x: x0 + p, y: cy + 12, text: A.sourceLink, size: 11.5, weight: 500, color: C.navy600, maxWidth: iw }).svg);
  const src = { x: x0 + p, y: cy - 4, w: srcW, h: 26 };
  return { svg: s.join(''), h, source: src };
}

function docsMobile(x0, y0, w) {
  const A = LK.airport;
  const s = [];
  const p = 16;
  const iw = w - p * 2;
  const n = K.textBlock({ x: x0 + p, y: 0, text: A.docsNote, size: 11.5, color: C.muted, maxWidth: iw, lh: 16 });
  // На 390px подпись и состояние не влезают в одну строку — состояние уходит под подпись
  const rows = A.docs.map((d) => ({
    label: K.textBlock({ x: x0 + p, y: 0, text: d.label, size: 13, weight: 500, color: C.navy600, maxWidth: iw, lh: 19 }),
    state: K.textBlock({ x: x0 + p, y: 0, text: d.state, size: 11.5, color: C.muted2, maxWidth: iw, lh: 16 }),
  }));
  const rowsH = rows.reduce((a, r) => a + r.label.height + 4 + r.state.height + 6 + 8, 0);
  const h = 54 + 16 + rowsH + n.height + 20;
  s.push(cardFrameM(x0, y0, w, h, A.docsTitle));
  let cy = y0 + 54 + 16;
  rows.forEach((r) => {
    s.push(K.group([r.label.svg], `translate(0,${cy})`));
    cy += r.label.height + 4;
    s.push(K.group([r.state.svg], `translate(0,${cy})`));
    cy += r.state.height + 6;
    s.push(K.line(x0 + p, cy, x0 + p + iw, cy, C.line2));
    cy += 8;
  });
  s.push(K.group([n.svg], `translate(0,${cy})`));
  return { svg: s.join(''), h };
}

function buildLkMobile(screen) {
  const body =
    screen === 'history'
      ? historyMobile
      : screen === 'settings'
        ? settingsMobile
        : screen === 'tariff'
          ? tariffMobile
          : screen === 'subscription'
            ? subscriptionMobile
            : screen === 'airport'
              ? airportMobile
              : emptyMobile;
  const active = screen === 'empty' ? 'history' : screen;
  const x0 = M.pad;
  const w = M.w - M.pad * 2;
  const hd = mobileHeader();
  const top = hd.h + 22;
  const probe = body(x0, 0, w);
  // Новый ЛК — один экран без разделов, поэтому нижних табов нет (Q1, `structure` SAF-180 § 3.4).
  // Выход из ЛК на телефоне шапкой не отдан: там нет разделов, поэтому «Выйти» — кнопка под карточками.
  const withTabs = screen !== 'airport';
  const exitH = withTabs ? 0 : 18 + 44;
  const totalH = top + probe.h + (withTabs ? M.tabH : 0) + exitH + 34;
  const content = body(x0, top, w);
  const tabs = withTabs ? mobileTabs(active, totalH - M.tabH) : { svg: '', spots: [] };
  let exitSpots = [];
  if (!withTabs) {
    const ew = Math.min(200, w);
    const ey = top + probe.h + 18;
    content.svg += K.button(x0, ey, ew, 44, LK.exit, 'secondary', 13.5);
    exitSpots = [{ x: x0, y: ey, w: ew, h: 44, to: 'landing', label: LK.exit }];
  }
  return {
    svg: K.svgOpen(M.w, totalH, C.bg2) + content.svg + tabs.svg + hd.svg + '</svg>',
    spots: [...(content.spots || []), ...tabs.spots, ...exitSpots],
    controls: content.controls || [],
    w: M.w,
    h: totalH,
  };
}

module.exports = { buildLkDesktop, buildLkMobile };
