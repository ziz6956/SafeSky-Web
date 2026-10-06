'use strict';

const K = require('./svgkit');
const { C } = require('./theme');
const { LANDING: L } = require('./content');

const D = {
  w: 1440,
  pad: 120,
  navH: 78,
  h1: 52,
  h1lh: 62,
  h2: 34,
  h2lh: 44,
  h3: 19,
  body: 17,
  bodyLh: 28,
  small: 14,
  smallLh: 22,
  tiny: 12.5,
  r: 18,
  gap: 28,
};

const M = {
  w: 390,
  pad: 20,
  navH: 64,
  h1: 30,
  h1lh: 38,
  h2: 24,
  h2lh: 32,
  h3: 17,
  body: 15.5,
  bodyLh: 24,
  small: 13,
  smallLh: 20,
  tiny: 11.5,
  r: 16,
  gap: 12,
};

/** Кликабельная зона: координаты в системе координат экрана. */
function spot(x, y, w, h, to, label) {
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), to, label };
}

/* ------------------------------------------------------------------ блок 1: шапка */

function nav(dev) {
  const m = dev === 'desktop' ? D : M;
  const W = m.w;
  const s = [];
  const spots = [];
  s.push(K.rect(0, 0, W, m.navH, { fill: '#FFFFFF' }));
  s.push(K.line(0, m.navH, W, m.navH, C.line));
  const iconSize = dev === 'desktop' ? 26 : 24;
  s.push(K.icon('shield', m.pad, (m.navH - iconSize) / 2, iconSize, C.navy700, 1.8));
  s.push(
    K.textBlock({
      x: m.pad + iconSize + 10,
      y: m.navH / 2 + 6,
      text: L.brand,
      size: dev === 'desktop' ? 20 : 19,
      weight: 700,
      color: C.ink,
    }).svg,
  );
  if (dev === 'desktop') {
    const bw = Math.round(K.measure(L.navCta, 14.5, 600)) + 56;
    const bx = m.w - m.pad - bw;
    const links = [];
    let lx = bx - 40;
    const rendered = L.nav.map((t) => ({ t, w: K.measure(t, 15, 500) }));
    lx -= rendered.reduce((a, r) => a + r.w, 0) + 34 * (rendered.length - 1);
    for (const r of rendered) {
      links.push(K.textBlock({ x: lx, y: m.navH / 2 + 5, text: r.t, size: 15, weight: 500, color: C.ink2 }).svg);
      lx += r.w + 34;
    }
    s.push(links.join(''));
    s.push(K.button(bx, (m.navH - 46) / 2, bw, 46, L.navCta, 'primary', 14.5));
    spots.push(spot(bx, (m.navH - 46) / 2, bw, 46, 'register', L.navCta));
  } else {
    // На телефоне CTA остаётся в шапке (компактный) — рядом с «бургером»,
    // иначе регистрация из шапки недоступна, а макет требует её на обоих экранах.
    const burgerX = m.w - m.pad - 24;
    const bw = Math.round(K.measure(L.navCta, 12.5, 600)) + 32;
    const bh = 38;
    const bx = burgerX - 14 - bw;
    s.push(K.button(bx, (m.navH - bh) / 2, bw, bh, L.navCta, 'primary', 12.5));
    spots.push(spot(bx, (m.navH - bh) / 2, bw, bh, 'register', L.navCta));
    const by = m.navH / 2 - 8;
    s.push(K.rect(burgerX, by, 24, 2, { fill: C.ink2, rx: 1 }));
    s.push(K.rect(burgerX, by + 7, 24, 2, { fill: C.ink2, rx: 1 }));
    s.push(K.rect(burgerX, by + 14, 24, 2, { fill: C.ink2, rx: 1 }));
    spots.push(spot(burgerX - 2, m.navH / 2 - 14, 34, 28, 'register', 'Меню'));
  }
  return { svg: s.join(''), h: m.navH, spots };
}

/** Карточка звонка — визуальный якорь героя. */
function callCard(dev) {
  const isD = dev === 'desktop';
  const w = isD ? 420 : 350;
  const pad = isD ? 28 : 22;
  const tw = w - pad * 2;
  const ty = 108;
  const textSize = isD ? 15.5 : 14.5;
  const textLh = isD ? 25 : 23;
  const noteSize = isD ? 12.5 : 11.5;
  const noteLh = isD ? 19 : 17;
  const btnH = 40;
  const s = [];

  // Высоту карточки считаем по содержимому. Жёсткие 262px на телефоне ставили
  // кнопки «Ответить/Отклонить» на вторую строку примечания (по ширине 350px
  // и текст, и примечание переносятся иначе, чем на десктопе).
  const q = K.textBlock({ x: pad, y: 0, text: L.hero.callText, size: textSize, weight: 500, color: C.navy800, maxWidth: tw, lh: textLh });
  const nTop = ty + q.height + 12;
  const n = K.textBlock({ x: pad, y: 0, text: L.hero.callNote, size: noteSize, color: C.muted, maxWidth: tw, lh: noteLh });
  const by = nTop + n.height + 18; // кнопки ниже примечания, а не у нижней кромки
  const h = by + btnH + (isD ? 24 : 22);

  s.push(
    `<defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#04102A" flood-opacity="0.35"/></filter></defs>`,
  );
  s.push(`<g filter="url(#soft)">${K.roundRect(0, 0, w, h, 24, { fill: '#FFFFFF' })}</g>`);
  s.push(K.iconBadge(pad, 26, 44, 'phone', { bg: C.blue50, fg: C.navy700, iconSize: 22 }));
  s.push(
    K.textBlock({ x: pad + 58, y: 46, text: L.hero.callTitle, size: isD ? 13 : 12, weight: 600, color: C.muted, ls: 0.4 }).svg,
  );
  s.push(K.textBlock({ x: pad + 58, y: 68, text: L.hero.callFrom, size: isD ? 19 : 17, weight: 700, color: C.ink }).svg);
  s.push(K.group([q.svg], `translate(0,${ty})`));
  s.push(K.group([n.svg], `translate(0,${nTop})`));
  // «Ответить / Отклонить» — нейтральная пара, без тревожного красного
  const bw = (tw - 12) / 2;
  s.push(K.roundRect(pad, by, bw, btnH, 20, { fill: C.greenBg }));
  s.push(K.textBlock({ x: pad + bw / 2, y: by + 26, text: 'Ответить', size: 14, weight: 600, color: C.green, anchor: 'middle' }).svg);
  s.push(K.roundRect(pad + bw + 12, by, bw, btnH, 20, { fill: 'none', stroke: C.line, 'stroke-width': 1.4 }));
  s.push(K.textBlock({ x: pad + bw + 12 + bw / 2, y: by + 26, text: 'Отклонить', size: 14, weight: 600, color: C.ink2, anchor: 'middle' }).svg);
  return { svg: s.join(''), w, h };
}

/** Блок 1. Hero: УТП и CTA. */
function hero(dev) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const W = m.w;
  const s = [];
  const spots = [];
  const pad = m.pad;
  const cw = isD ? 660 : W - pad * 2;
  let y = m.navH + (isD ? 62 : 30);
  const top = y;

  const h1 = K.textBlock({
    x: pad,
    y: y + m.h1lh * 0.78,
    text: L.hero.h1,
    size: m.h1,
    weight: 700,
    color: '#FFFFFF',
    maxWidth: cw,
    lh: m.h1lh,
  });
  s.push(h1.svg);
  y += h1.height + (isD ? 22 : 14);

  const sub = K.textBlock({
    x: pad,
    y: y + (isD ? 16 : 12),
    text: L.hero.sub,
    size: isD ? m.body : 15,
    color: C.blue200,
    maxWidth: isD ? 600 : cw,
    lh: isD ? m.bodyLh : 23,
  });
  s.push(sub.svg);
  y += sub.height + (isD ? 20 : 16);

  // строка доверия — подсвеченная плашка
  const trustW = isD ? 620 : cw;
  const trust = K.textBlock({
    x: pad + 46,
    y: y + (isD ? 24 : 20),
    text: L.hero.trust,
    size: isD ? 14.5 : 13,
    weight: 500,
    color: '#E7EEFC',
    maxWidth: trustW - 62,
    lh: isD ? 22 : 19,
  });
  const th = trust.height + (isD ? 34 : 28);
  s.push(K.roundRect(pad, y, trustW, th, 14, { fill: 'rgba(255,255,255,0.10)' }));
  s.push(K.icon('shield', pad + 16, y + (isD ? 13 : 11), 18, C.blue400, 1.8));
  s.push(trust.svg);
  y += th + (isD ? 22 : 16);

  const ctaH = isD ? 56 : 52;
  if (isD) {
    // Ширина главного CTA считается по тексту: «Зарегистрироваться» короче прежней
    // формулировки, фиксированные 246px давали лишние поля по краям кнопки.
    const w1 = Math.round(K.measure(L.hero.cta, 15.5, 600)) + 84;
    const w2 = Math.round(K.measure(L.hero.cta2, 15.5, 600)) + 68;
    s.push(K.button(pad, y, w1, ctaH, L.hero.cta, 'light', 15.5));
    spots.push(spot(pad, y, w1, ctaH, 'register', L.hero.cta));
    s.push(K.button(pad + w1 + 16, y, w2, ctaH, L.hero.cta2, 'ghost', 15.5));
  } else {
    s.push(K.button(pad, y, cw, ctaH, L.hero.cta, 'light', 15));
    spots.push(spot(pad, y, cw, ctaH, 'register', L.hero.cta));
    y += ctaH + 10;
    s.push(K.button(pad, y, cw, 48, L.hero.cta2, 'ghost', 15));
  }
  y += ctaH + (isD ? 14 : 12);

  const micro = K.textBlock({ x: pad, y: y + (isD ? 10 : 8), text: L.hero.micro, size: isD ? 13 : 12, color: C.blue200, maxWidth: cw, lh: 19 });
  s.push(micro.svg);
  y += micro.height + (isD ? 26 : 20);

  // строка позиционирования (обязательна по `structure` блок 1, §9.1)
  s.push(K.line(pad, y, pad + (isD ? 620 : cw), y, 'rgba(255,255,255,0.16)'));
  y += isD ? 24 : 18;
  const pos = K.textBlock({
    x: pad,
    y: y + 12,
    text: L.hero.positioning,
    size: isD ? 13.5 : 12.5,
    weight: 500,
    color: C.blue200,
    maxWidth: isD ? 620 : cw,
    lh: isD ? 20 : 18,
  });
  s.push(pos.svg);
  y += pos.height + (isD ? 40 : 28);

  const card = callCard(dev);
  if (isD) {
    const cardX = W - pad - card.w;
    const cardY = top + 6;
    s.push(K.group([card.svg], `translate(${cardX},${cardY})`));
    y = Math.max(y, cardY + card.h + 40);
  } else {
    y += 4;
    s.push(K.group([card.svg], `translate(${pad},${y})`));
    y += card.h + 32;
  }

  const bg =
    `<defs><linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="#0B1B3C"/><stop offset="55%" stop-color="#102A57"/><stop offset="100%" stop-color="#153567"/>` +
    `</linearGradient></defs>` +
    K.rect(0, m.navH, W, y - m.navH, { fill: 'url(#heroGrad)' });

  return { bg, fg: s.join(''), h: y, spots };
}

/* ------------------------------------------------------------------ общий заголовок секции */

function secHead(dev, x, y, w, h2, sub, opts = {}) {
  const m = dev === 'desktop' ? D : M;
  const color = opts.color || C.ink;
  const subColor = opts.subColor || C.muted;
  const s = [];
  const a = K.textBlock({ x, y: y + m.h2lh * 0.8, text: h2, size: m.h2, weight: 700, color, maxWidth: w, lh: m.h2lh });
  s.push(a.svg);
  let h = a.height;
  if (sub) {
    const b = K.textBlock({ x, y: y + h + 12, text: sub, size: m.body - 1.5, color: subColor, maxWidth: opts.subW || w, lh: m.bodyLh - 3 });
    s.push(b.svg);
    h += 12 + b.height;
  }
  return { svg: s.join(''), h };
}

/* ------------------------------------------------------------------ блок 2: как это работает */

function howSection(dev, y0) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const W = m.w;
  const cw = W - pad * 2;
  const s = [];
  let y = y0 + (isD ? 84 : 52);
  const head = secHead(dev, pad, y, isD ? 640 : cw, L.how.h2, null);
  s.push(head.svg);
  y += head.h + (isD ? 44 : 28);

  const steps = L.how.steps; // ровно 3 — по `structure` блок 2
  const cols = isD ? 3 : 1;
  const icons = ['globe', 'shield', 'phone'];
  const gap = isD ? 32 : 26;
  const w = isD ? (cw - gap * (cols - 1)) / cols : cw;
  const badge = isD ? 46 : 40;
  const titleSize = m.h3 - (isD ? 0 : 1);
  const descSize = isD ? 14.5 : 14;
  const descLh = isD ? 23 : 21;

  // Сначала измеряем шаги: высота зависит от переноса текста, поэтому фиксированный
  // шаг сетки давал наложение иконки следующего шага на текст предыдущего (мобильный).
  const measured = steps.map((st) => {
    const t = K.textBlock({ x: 0, y: 0, text: st.t, size: titleSize, weight: 700, color: C.ink, maxWidth: w, lh: 25 });
    const d = K.textBlock({ x: 0, y: 0, text: st.d, size: descSize, color: C.muted, maxWidth: w, lh: descLh });
    return { t, d, h: badge + 24 + t.height + 8 + d.height };
  });
  const stepH = Math.max(...measured.map((x) => x.h));
  const rowY = y;
  let cy = rowY;
  steps.forEach((st, i) => {
    const cx = isD ? pad + i * (w + gap) : pad;
    const top = isD ? rowY : cy;
    const { t, d } = measured[i];
    s.push(K.iconBadge(cx, top, badge, icons[i], { bg: C.blue50, fg: C.navy700, iconSize: isD ? 22 : 20 }));
    // номер шага
    s.push(
      K.textBlock({
        x: cx + badge + 12,
        y: top + (isD ? 30 : 26),
        text: String(i + 1).padStart(2, '0'),
        size: isD ? 13 : 12,
        weight: 700,
        color: C.muted2,
        ls: 1,
      }).svg,
    );
    s.push(K.group([t.svg], `translate(${cx},${top + badge + 24})`));
    s.push(K.group([d.svg], `translate(${cx},${top + badge + 24 + t.height + 8})`));
    if (isD && i < cols - 1) {
      s.push(K.line(cx + w + gap / 2, top + 6, cx + w + gap / 2, top + stepH - 8, C.line2));
    }
    cy = top + stepH + gap;
  });
  y = isD ? rowY + stepH + 24 : cy;
  return { svg: s.join(''), h: y - y0 };
}

/* ------------------------------------------------------------------ блок 3: что это и чем не является */

function disclaimerSection(dev, y0) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const cw = m.w - pad * 2;
  const s = [];
  let y = y0 + (isD ? 76 : 48);

  const head = secHead(dev, pad, y, isD ? 700 : cw, L.disclaimer.h2, null);
  s.push(head.svg);
  y += head.h + (isD ? 32 : 22);

  const panelX = pad;
  const panelW = isD ? 1000 : cw;
  const innerPad = isD ? 36 : 20;
  const textX = panelX + innerPad + (isD ? 26 : 20);
  const textW = panelW - innerPad * 2 - (isD ? 26 : 20);
  const panelTop = y;

  const paras = [];
  let py = y + innerPad;
  L.disclaimer.paras.forEach((p, i) => {
    const t = K.textBlock({ x: textX, y: py, text: p, size: isD ? 15.5 : 14, color: C.ink2, maxWidth: textW, lh: isD ? 24 : 21 });
    paras.push(K.group([K.circle(panelX + innerPad + 8, py - 5, 3.5, { fill: i === 0 ? C.navy700 : C.blue400 }), t.svg]));
    py += t.height + (isD ? 18 : 14);
  });
  const panelH = py - innerPad - panelTop + innerPad;
  s.push(K.roundRect(panelX, panelTop, panelW, panelH, D.r, { fill: C.bg2, stroke: C.line2 }));
  s.push(K.rect(panelX, panelTop + 16, 3, panelH - 32, { fill: C.blue400, rx: 2 }));
  s.push(...paras);
  y = panelTop + panelH + (isD ? 76 : 48);
  return { svg: s.join(''), h: y - y0 };
}

/* ------------------------------------------------------------------ блок 4: тарифы */

function pricingSection(dev, y0) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const cw = m.w - pad * 2;
  const s = [];
  const spots = [];
  let y = y0 + (isD ? 84 : 52);
  const head = secHead(dev, pad, y, isD ? 700 : cw, L.pricing.h2, L.pricing.sub, { subW: isD ? 700 : cw });
  s.push(head.svg);
  y += head.h + (isD ? 40 : 24);

  // 4 карточки: Free крайняя левая (`structure` блок 4). Все без акцента —
  // не выделяем платный тариф визуально (позиция «не зарабатываем на беде»).
  const gap = isD ? 20 : 12;
  const w = isD ? (cw - gap * 3) / 4 : cw;
  const px0 = isD ? 24 : 22;
  const iw = w - px0 * 2;
  const descTop = isD ? 146 : 130;
  const descLh = 21;
  const descSize = 13.5;
  const bh = isD ? 48 : 44;
  // Высота карточки — по самой длинной подписи тарифа: на мобильном «Paid»
  // переносится в 4 строки, и фиксированные 226px заводили текст под кнопку.
  const descH = Math.max(
    ...L.pricing.plans.map((p) => K.textBlock({ x: 0, y: 0, text: p.d, size: descSize, color: C.muted, maxWidth: iw, lh: descLh }).height),
  );
  const cardH = isD ? 322 : Math.max(226, descTop + descH + 16 + bh + 16);
  L.pricing.plans.forEach((p, i) => {
    const x = isD ? pad + i * (w + gap) : pad;
    const cy = isD ? y : y + i * (cardH + gap);
    s.push(K.roundRect(x, cy, w, cardH, D.r, { fill: '#FFFFFF', stroke: C.line }));
    const px = x + px0;
    s.push(K.textBlock({ x: px, y: cy + (isD ? 36 : 32), text: p.name, size: isD ? 14 : 14, weight: 700, color: C.navy700, ls: 0.3 }).svg);
    s.push(K.textBlock({ x: px, y: cy + (isD ? 88 : 78), text: p.price, size: isD ? 36 : 32, weight: 700, color: C.ink }).svg);
    const pw = K.measure(p.price, isD ? 36 : 32, 700);
    s.push(K.textBlock({ x: px + pw + 6, y: cy + (isD ? 88 : 78), text: p.per, size: isD ? 14 : 13, color: C.muted }).svg);
    s.push(K.line(px, cy + (isD ? 116 : 104), px + iw, cy + (isD ? 116 : 104), C.line2));
    s.push(K.textBlock({ x: px, y: cy + descTop, text: p.d, size: descSize, color: C.muted, maxWidth: iw, lh: descLh }).svg);
    const by = cy + cardH - bh - (isD ? 18 : 16);
    s.push(K.button(px, by, iw, bh, p.cta, i === 0 ? 'secondary' : 'primary', isD ? 14 : 13.5));
    spots.push(spot(px, by, iw, bh, 'register', p.name + ' — ' + p.cta));
  });
  y = (isD ? y + cardH : y + 4 * cardH + 3 * gap) + (isD ? 22 : 18);

  s.push(K.textBlock({ x: pad, y: y + 10, text: L.pricing.payNote, size: isD ? 13 : 12.5, weight: 600, color: C.navy700 }).svg);
  y += (isD ? 34 : 30);

  // три оговорки — часть блока, не сноска
  L.pricing.notes.forEach((n) => {
    const t = K.textBlock({ x: pad + 18, y: y + 9, text: n, size: isD ? 13 : 12, color: C.muted, maxWidth: isD ? 1000 : cw - 18, lh: isD ? 20 : 18 });
    s.push(K.icon('shield', pad, y - 2, 13, C.muted2, 1.7));
    s.push(t.svg);
    y += t.height + (isD ? 10 : 8);
  });
  y += isD ? 76 : 48;
  return { svg: s.join(''), h: y - y0, spots };
}

/* ------------------------------------------------------------------ блок 5: доверие и честные ограничения */

function trustSection(dev, y0, hEnd) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const cw = m.w - pad * 2;
  const s = [];
  s.push(K.rect(0, y0, m.w, hEnd - y0, { fill: C.bg2 }));
  let y = y0 + (isD ? 84 : 52);

  // заголовок слева, список — справа (ПК)
  const headW = isD ? 360 : cw;
  const head = secHead(dev, pad, y, headW, L.trust.h2, null);
  s.push(head.svg);
  const listX = isD ? pad + 420 : pad;
  const listW = isD ? cw - 420 : cw;
  let ly = isD ? y - 6 : y + head.h + 24;

  L.trust.items.forEach((it, i) => {
    const numW = isD ? 34 : 28;
    const t = K.textBlock({
      x: listX + numW,
      y: ly + (isD ? 22 : 18),
      text: it,
      size: isD ? 15 : 14,
      color: C.ink2,
      maxWidth: listW - numW,
      lh: isD ? 23 : 21,
    });
    s.push(
      K.textBlock({
        x: listX,
        y: ly + (isD ? 22 : 18),
        text: String(i + 1).padStart(2, '0'),
        size: isD ? 12.5 : 12,
        weight: 700,
        color: C.muted2,
        ls: 0.6,
      }).svg,
    );
    s.push(t.svg);
    ly += t.height + (isD ? 26 : 20);
    if (i < L.trust.items.length - 1) {
      s.push(K.line(listX, ly - (isD ? 14 : 11), listX + listW, ly - (isD ? 14 : 11), C.line2));
    }
  });

  y = isD ? Math.max(ly, y + head.h) + 34 : ly + 28;
  return { svg: s.join(''), h: y - y0 };
}

/* ------------------------------------------------------------------ блок 6: FAQ */

function faqSection(dev, y0) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const cw = m.w - m.pad * 2;
  const w = isD ? 940 : cw;
  const x = isD ? (m.w - w) / 2 : m.pad;
  const s = [];
  let y = y0 + (isD ? 84 : 52);
  const head = secHead(dev, x, y, w, L.faq.h2, null);
  s.push(head.svg);
  y += head.h + (isD ? 32 : 22);

  L.faq.items.forEach((it, i) => {
    const open = i === 0;
    const padX = isD ? 32 : 20;
    const qw = w - padX * 2 - (isD ? 40 : 34);
    const q = K.textBlock({ x: x + padX, y: y + (isD ? 34 : 28), text: it.q, size: isD ? 17 : 15, weight: 600, color: C.ink, maxWidth: qw, lh: 24 });
    let h = (isD ? 34 : 28) + q.height + (isD ? 24 : 18);
    let body = '';
    if (open) {
      const a = K.textBlock({ x: x + padX, y: y + (isD ? 34 : 28) + q.height + 12, text: it.a, size: isD ? 15 : 13.5, color: C.muted, maxWidth: qw, lh: isD ? 23 : 20 });
      body = a.svg;
      h = (isD ? 34 : 28) + q.height + 12 + a.height - (isD ? 24 : 18) + (isD ? 30 : 22);
    }
    s.push(K.roundRect(x, y, w, h, isD ? 14 : 12, { fill: open ? '#FFFFFF' : C.bg2, stroke: open ? C.line : C.line2 }));
    s.push(q.svg);
    s.push(body);
    const cx = x + w - (isD ? 34 : 26);
    if (open) {
      s.push(K.rect(cx - 7, y + (isD ? 34 : 30) - 9, 14, 2, { fill: C.navy700 }));
    } else {
      s.push(K.rect(cx - 7, y + h / 2 - 1, 14, 2, { fill: C.ink2 }));
      s.push(K.rect(cx - 1, y + h / 2 - 7, 2, 14, { fill: C.ink2 }));
    }
    y += h + (isD ? 12 : 10);
  });
  y += isD ? 72 : 44;
  return { svg: s.join(''), h: y - y0 };
}

/* ------------------------------------------------------------------ блок 7: форма + реферал */

/**
 * Поле ввода с подписью. Возвращает { svg, h, input }.
 * `input` — геометрия прямоугольника поля (в координатах карточки): по ней прототип
 * кладёт поверх макета настоящее поле ввода, чтобы форму можно было заполнить.
 */
function field(dev, x, y, w, label, value, opts = {}) {
  const isD = dev === 'desktop';
  const s = [];
  const err = !!opts.error;
  const size = opts.size || (isD ? 15.5 : 14.5);
  s.push(K.textBlock({ x, y: y + (isD ? 18 : 16), text: label, size: isD ? 13.5 : 12.5, weight: 600, color: C.ink }).svg);
  let cy = y + (isD ? 28 : 26);
  const ih = opts.h || (isD ? 54 : 50);
  const input = { x, y: cy, w, h: ih };
  s.push(
    K.roundRect(x, cy, w, ih, 12, {
      fill: '#FFFFFF',
      stroke: err ? C.alert : opts.focus ? C.navy600 : C.line,
      'stroke-width': err || opts.focus ? 1.6 : 1.2,
    }),
  );
  s.push(
    K.textBlock({
      x: x + 16,
      y: cy + Math.round(ih / 2) + Math.round(size * 0.36),
      text: value,
      size,
      weight: opts.focus ? 500 : 400,
      color: opts.focus ? C.ink : C.muted2,
      ls: opts.ls || 0,
    }).svg,
  );
  if (opts.mask) {
    // Две краски («+7 » серым, знаки — тёмным), но одна визуальная строка:
    // рисуем вплотную и помечаем join, иначе детектор читает это как слипание.
    const mw = K.measure(opts.mask.prefix, size, 400);
    const by = cy + Math.round(ih / 2) + Math.round(size * 0.36);
    s.push(K.textBlock({ x: x + 16, y: by, text: opts.mask.prefix, size, weight: 500, color: C.muted2, join: true }).svg);
    s.push(K.textBlock({ x: x + 16 + mw, y: by, text: opts.mask.rest, size, color: C.ink, join: true }).svg);
  }
  cy += ih;
  if (opts.error) {
    const e = K.textBlock({ x, y: cy + (isD ? 21 : 18), text: opts.error, size: isD ? 12.5 : 11.5, weight: 500, color: C.alert, maxWidth: w, lh: 17 });
    s.push(e.svg);
    cy += e.height + (isD ? 10 : 8);
  } else if (opts.hint) {
    const h = K.textBlock({ x, y: cy + (isD ? 20 : 16), text: opts.hint, size: isD ? 12.5 : 11.5, color: C.muted, maxWidth: w, lh: 17 });
    s.push(h.svg);
    cy += h.height + (isD ? 8 : 6);
  }
  return { svg: s.join(''), h: cy - y, input };
}

function registerSection(dev, y0) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const W = m.w;
  const s = [];
  let y = y0 + (isD ? 84 : 52);

  const cardW = isD ? 560 : W - pad * 2;
  const cardX = isD ? W - pad - cardW : pad;
  const content = registerCard(dev, cardW);
  const leftW = isD ? W - pad * 2 - cardW - 80 : W - pad * 2;

  const head = K.textBlock({ x: pad, y: y + m.h2lh * 0.8, text: L.register.blockH2, size: m.h2, weight: 700, color: '#FFFFFF', maxWidth: leftW, lh: m.h2lh });
  s.push(head.svg);
  const sub = K.textBlock({ x: pad, y: y + head.height + 14, text: L.register.sub, size: isD ? 16 : 14.5, color: C.blue200, maxWidth: isD ? 460 : leftW, lh: isD ? 26 : 22 });
  s.push(sub.svg);
  let ly = y + head.height + 14 + sub.height + (isD ? 28 : 22);

  // Три шага сценария (structure SAF-180 § 2) вместо прежних обещаний waitlist.
  // Реферальное предложение из блока убрано — structure SAF-180 § 1 (R-23: место не определено).
  L.register.steps.forEach((b, i) => {
    const num = isD ? 26 : 23;
    s.push(K.circle(pad + num / 2, ly - 5, num / 2, { fill: 'rgba(255,255,255,0.12)' }));
    s.push(K.textBlock({ x: pad + num / 2, y: ly, text: String(i + 1), size: isD ? 13 : 12, weight: 700, color: '#FFFFFF', anchor: 'middle' }).svg);
    const bt = K.textBlock({ x: pad + num + 14, y: ly + 1, text: b, size: isD ? 15 : 13.5, color: '#E7EEFC', maxWidth: leftW - num - 14, lh: isD ? 22 : 20 });
    s.push(bt.svg);
    ly += Math.max(bt.height, num) + (isD ? 16 : 13);
  });

  ly += isD ? 8 : 6;
  const noteW = isD ? 460 : leftW;
  const note = K.textBlock({
    x: pad + 40,
    y: ly,
    text: L.register.demoNote,
    size: isD ? 12.5 : 11.5,
    color: C.blue200,
    maxWidth: noteW - 56,
    lh: isD ? 19 : 17,
  });
  const noteH = note.height + 26;
  s.push(K.roundRect(pad, ly - 18, noteW, noteH, 12, { fill: 'rgba(255,255,255,0.08)' }));
  s.push(K.icon('wifi', pad + 14, ly - 8, 18, C.blue400, 1.8));
  s.push(note.svg);
  ly += noteH;

  const cardY = isD ? y - 12 : ly + 18;
  s.push(K.group([content.svg], `translate(${cardX},${cardY})`));
  // Карточка на лендинге — статичный макет: настоящих полей тут нет, а кнопка ведёт
  // на отдельный экран регистрации, где форма уже заполняется по-настоящему.
  const spots = content.spots.map((sp) => spot(sp.x + cardX, sp.y + cardY, sp.w, sp.h, sp.to === 'code' ? 'register' : sp.to, sp.label));
  y = Math.max(cardY + content.h, ly) + (isD ? 84 : 48);

  const bg =
    `<defs><linearGradient id="wlGrad" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="#102A57"/><stop offset="100%" stop-color="#0B1B3C"/></linearGradient></defs>` +
    K.rect(0, y0, W, y - y0, { fill: 'url(#wlGrad)' });
  return { bg, svg: s.join(''), h: y - y0, spots };
}

function withCard(s, bodyStart, w, h) {
  const head = s.slice(0, bodyStart).join('');
  const body = s.slice(bodyStart).join('');
  const card = `<g filter="url(#cardShadow)">${K.roundRect(0, 0, w, h, 20, { fill: '#FFFFFF' })}</g>`;
  return head + card + body;
}

/** Форма регистрации по телефону — вынесена отдельно, используется и в PNG-экране. */
function registerCard(dev, w, state = 'form') {
  const isD = dev === 'desktop';
  const pad = isD ? 36 : 22;
  const iw = w - pad * 2;
  const s = [];
  const spots = [];
  // Настоящие поля ввода, которые прототип кладёт поверх нарисованной формы
  // (в PNG их нет — там статичный макет). Координаты — в системе карточки.
  const controls = [];
  let y = pad;
  s.push(
    `<defs><filter id="cardShadow" x="-25%" y="-25%" width="150%" height="150%">` +
      `<feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#04102A" flood-opacity="0.28"/></filter></defs>`,
  );
  const bodyStart = s.length;
  const err = state === 'error';

  const f1 = field(dev, pad, y, iw, L.register.phoneLabel, '', {
    focus: !err,
    error: err ? L.register.validation.phone : null,
    mask: { prefix: '+7 ', rest: '(___) ___-__-__' },
  });
  s.push(f1.svg);
  controls.push({
    kind: 'tel',
    name: 'phone',
    label: L.register.phoneLabel,
    prefix: '+7',
    placeholder: '(___) ___-__-__',
    mask: 'phone',
    required: true,
    autocomplete: 'tel',
    error: L.register.validation.phone,
    fontSize: isD ? 15.5 : 14.5,
    weight: 500,
    ...f1.input,
  });
  y += f1.h + (isD ? 14 : 12);

  // Галочка согласия на обработку ПДн — обязательна, снята по умолчанию
  // (вердикт Legal SAF-177 § 1.5: согласие до отправки SMS, отдельно от кнопки).
  const c = L.register.consent;
  const box = isD ? 20 : 18;
  s.push(
    K.roundRect(pad, y + 2, box, box, 5, {
      fill: '#FFFFFF',
      stroke: err ? C.alert : C.navy600,
      'stroke-width': 1.6,
    }),
  );
  const tx = pad + box + 12;
  const ct = K.textBlock({ x: tx, y, text: c.text, size: isD ? 13 : 12.5, weight: 500, color: C.ink, maxWidth: iw - box - 12, lh: isD ? 19 : 18 });
  s.push(ct.svg);
  let cy = y + ct.height + 2;
  const lt = K.textBlock({ x: tx, y: cy, text: c.link, size: isD ? 12.5 : 12, color: C.navy600, maxWidth: iw - box - 12, lh: 18 });
  s.push(lt.svg);
  s.push(K.line(tx, cy + 2, tx + K.measure(c.link, isD ? 12.5 : 12, 400), cy + 2, C.navy600));
  cy += lt.height;
  const nt = K.textBlock({ x: tx, y: cy + 6, text: c.note, size: isD ? 12 : 11.5, color: C.muted, maxWidth: iw - box - 12, lh: 17 });
  s.push(nt.svg);
  cy += 6 + nt.height;
  if (err) {
    const ce = K.textBlock({ x: tx, y: cy + 16, text: L.register.validation.consent, size: isD ? 12.5 : 11.5, weight: 500, color: C.alert, maxWidth: iw - box - 12, lh: 17 });
    s.push(ce.svg);
    cy += ce.height + 8;
  }
  controls.push({
    kind: 'checkbox',
    name: 'consent_pdn',
    label: c.text,
    required: true,
    error: L.register.validation.consent,
    x: pad,
    y: y + 2,
    size: box,
    hit: { x: tx, y, w: iw - box - 12, h: isD ? 19 : 18 },
  });
  y = cy + (isD ? 18 : 14);

  const submitH = isD ? 56 : 52;
  s.push(K.button(pad, y, iw, submitH, L.register.submit, 'primary', isD ? 16 : 15.5));
  spots.push(spot(pad, y, iw, submitH, 'code', L.register.submit));
  controls.push({
    kind: 'submit',
    name: 'submit',
    label: L.register.submit,
    to: 'code',
    x: pad,
    y,
    w: iw,
    h: submitH,
  });
  y += submitH + 12;
  const foot = K.textBlock({ x: pad, y: y + 10, text: L.register.foot, size: isD ? 12 : 11.5, color: C.muted, maxWidth: iw, lh: 18 });
  s.push(foot.svg);
  y += foot.height + (isD ? 14 : 12);

  // Демо-пометка обязательна для публичного прототипа (G-3, R-12)
  const dn = K.textBlock({ x: pad + 34, y: y + 20, text: L.register.demoNote, size: isD ? 12 : 11.5, color: C.amber, maxWidth: iw - 48, lh: 17 });
  const dnH = dn.height + 26;
  s.push(K.roundRect(pad, y, iw, dnH, 10, { fill: C.amberBg, stroke: C.amberLine }));
  s.push(K.icon('wifi', pad + 12, y + 12, 16, C.amber, 1.8));
  s.push(dn.svg);
  y += dnH + pad - 4;

  const H = y;
  return { svg: withCard(s, bodyStart, w, H), w, h: H, spots, controls };
}

/** Экран 2. Ввод кода из SMS. state: input | error | blocked */
function codeCard(dev, w, state = 'input') {
  const isD = dev === 'desktop';
  const pad = isD ? 36 : 22;
  const iw = w - pad * 2;
  const s = [];
  const spots = [];
  const controls = [];
  let y = pad;
  s.push(
    `<defs><filter id="cardShadow" x="-25%" y="-25%" width="150%" height="150%">` +
      `<feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#04102A" flood-opacity="0.28"/></filter></defs>`,
  );
  const bodyStart = s.length;

  // Заголовок и подзаголовок экрана уже стоят над карточкой (darkScreen),
  // поэтому в карточке их не повторяем — как в карточке регистрации.
  const f = field(dev, pad, y, iw, L.code.label, L.code.placeholder, {
    focus: state === 'input',
    error: state !== 'input' ? (state === 'error' ? L.code.errWrong : L.code.errBlocked) : null,
    size: isD ? 18 : 16.5,
    ls: 2,
  });
  s.push(f.svg);
  const digitInput = f.input;
  // В состоянии «код заблокирован» поле не принимает ввод: код мёртв,
  // единственное действие — запросить новый (кнопка ниже).
  if (state !== 'blocked') {
    controls.push({
      kind: 'code',
      name: 'code',
      label: L.code.label,
      maxLength: 6,
      required: true,
      error: L.code.errWrong,
      fontSize: isD ? 18 : 16.5,
      weight: 500,
      ...digitInput,
    });
  }
  y += f.h + (isD ? 2 : 0);

  if (state === 'input') {
    const h = K.textBlock({ x: pad, y: y + 16, text: L.code.hint, size: isD ? 12.5 : 11.5, color: C.muted, maxWidth: iw, lh: 17 });
    s.push(h.svg);
    y += h.height + (isD ? 14 : 12);
  }

  const submitH = isD ? 54 : 50;
  const submitLabel = state === 'blocked' ? L.code.resendBlocked : L.code.submit;
  s.push(K.button(pad, y, iw, submitH, submitLabel, 'primary', isD ? 16 : 15.5));
  const submitTo = state === 'blocked' ? 'code' : 'register-success';
  spots.push(spot(pad, y, iw, submitH, submitTo, submitLabel));
  controls.push({ kind: 'submit', name: 'submit', label: submitLabel, to: submitTo, x: pad, y, w: iw, h: submitH });
  y += submitH + (isD ? 18 : 14);

  // Повторная отправка: таймер 30 с (input) / активная ссылка (только error —
  // в состоянии «заблокирован» ту же роль играет основная кнопка ниже).
  if (state === 'input') {
    const t = K.textBlock({ x: pad + iw / 2, y, text: L.code.timer, size: isD ? 13 : 12, color: C.muted, maxWidth: iw, lh: 18, anchor: 'middle' });
    s.push(t.svg);
    // Живой счётчик 30 с: прототип кладёт поверх нарисованной строки таймера свою
    controls.push({ kind: 'timer', name: 'resend', seconds: 30, timerText: L.code.timer, resendText: L.code.resend, text: L.code.resend, x: pad, y: y - 4, w: iw, h: t.height + 8 });
    y += t.height + (isD ? 10 : 8);
  } else if (state === 'error') {
    const rl = K.textBlock({ x: pad + iw / 2, y: y + 12, text: L.code.resend, size: isD ? 13.5 : 12.5, weight: 600, color: C.navy600, maxWidth: iw, anchor: 'middle' });
    s.push(rl.svg);
    const rw = K.measure(L.code.resend, isD ? 13.5 : 12.5, 600);
    s.push(K.line(pad + iw / 2 - rw / 2, y + 14, pad + iw / 2 + rw / 2, y + 14, C.navy600));
    spots.push(spot(pad + iw / 2 - rw / 2 - 8, y - 4, rw + 16, 28, 'code', L.code.resend));
    y += rl.height + (isD ? 16 : 12);
  }

  const ch = K.textBlock({ x: pad + iw / 2, y: y + 12, text: L.code.change, size: isD ? 13 : 12, color: C.muted, maxWidth: iw, anchor: 'middle' });
  s.push(ch.svg);
  const chw = K.measure(L.code.change, isD ? 13 : 12, 400);
  s.push(K.line(pad + iw / 2 - chw / 2, y + 14, pad + iw / 2 + chw / 2, y + 14, C.muted));
  spots.push(spot(pad + iw / 2 - chw / 2 - 8, y - 4, chw + 16, 26, 'register', L.code.change));
  y += ch.height + pad;

  return { svg: withCard(s, bodyStart, w, y), w, h: y, spots, controls, digitInput };
}

/** Справка о шаблоне SMS — рядом с экраном кода (для ревью и FE, не часть интерфейса). */
function smsHintCard(dev, w) {
  const isD = dev === 'desktop';
  const pad = isD ? 26 : 20;
  const iw = w - pad * 2;
  const s = [];
  let y = pad;
  s.push(K.textBlock({ x: pad, y: y + 12, text: 'Шаблон SMS', size: isD ? 12 : 11, weight: 700, color: C.muted, ls: 0.5, maxWidth: iw }).svg);
  y += 12 + 16;
  const t = K.textBlock({ x: pad + 42, y: y + 23, text: L.code.smsTemplate, size: isD ? 13.5 : 12.5, weight: 500, color: C.navy800, maxWidth: iw - 58, lh: isD ? 21 : 19 });
  const bh = t.height + 30;
  s.push(K.roundRect(pad, y, iw, bh, 12, { fill: C.bg2, stroke: C.line }));
  s.push(K.icon('phone', pad + 12, y + 13, 18, C.navy700, 1.8));
  s.push(t.svg);
  y += bh + 16;
  const n = K.textBlock({ x: pad, y: y + 4, text: L.code.smsNote, size: isD ? 12 : 11.5, color: C.muted, maxWidth: iw, lh: 17 });
  s.push(n.svg);
  y += n.height + pad;
  return { svg: K.roundRect(0, 0, w, y, 16, { fill: '#FFFFFF', stroke: C.line }) + s.join(''), w, h: y, spots: [] };
}

/* ------------------------------------------------------------------ блок 8: футер */

function footer(dev, y0) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const cw = m.w - pad * 2;
  const s = [];
  let y = y0 + (isD ? 60 : 42);
  const iconSize = 24;
  s.push(K.icon('shield', pad, y - 18, iconSize, C.blue400, 1.8));
  s.push(K.textBlock({ x: pad + iconSize + 10, y, text: L.brand, size: 18, weight: 700, color: '#FFFFFF' }).svg);

  if (isD) {
    // ссылки — справа от названия, в одну строку
    let lx = m.w - pad;
    const rendered = L.footer.links.map((t) => ({ t, w: K.measure(t, 13, 500) }));
    lx -= rendered.reduce((a, r) => a + r.w, 0) + 28 * (rendered.length - 1);
    for (const r of rendered) {
      s.push(K.textBlock({ x: lx, y, text: r.t, size: 13, weight: 500, color: '#DCE6F8' }).svg);
      lx += r.w + 28;
    }
  }
  y += 30;

  for (const lineText of [L.footer.line1, L.footer.line2, L.footer.line3]) {
    const t = K.textBlock({ x: pad, y, text: lineText, size: isD ? 13.5 : 12.5, color: C.blue200, maxWidth: isD ? 760 : cw, lh: 20 });
    s.push(t.svg);
    y += t.height + 8;
  }
  y += 14;

  if (!isD) {
    for (const l of L.footer.links) {
      s.push(K.textBlock({ x: pad, y: y + 12, text: l, size: 12.5, weight: 500, color: '#DCE6F8', maxWidth: cw }).svg);
      y += 24;
    }
    y += 6;
  }

  s.push(K.line(pad, y, m.w - pad, y, 'rgba(255,255,255,0.14)'));
  y += 24;
  const note = K.textBlock({ x: pad, y, text: L.footer.legalNote, size: isD ? 12.5 : 11.5, color: C.blue200, maxWidth: cw, lh: 18 });
  s.push(note.svg);
  y += note.height + 20;
  s.push(K.textBlock({ x: pad, y, text: L.footer.copy, size: 12, color: C.muted2 }).svg);
  y += 44;
  return { bg: K.rect(0, y0, m.w, y - y0, { fill: C.navy950 }), svg: s.join(''), h: y - y0 };
}

/* ------------------------------------------------------------------ сборка */

function buildLanding(dev) {
  const m = dev === 'desktop' ? D : M;
  const parts = [];
  const spots = [];
  let y = 0;
  const n = nav(dev);
  parts.push(n.svg);
  spots.push(...n.spots);
  y = n.h;

  // 1. hero — тёмный фон рисуем первым слоем
  const h = hero(dev);
  parts.push(h.bg, h.fg);
  spots.push(...h.spots);
  y += h.h;

  // 2. как это работает
  let r = howSection(dev, y);
  parts.push(r.svg);
  y += r.h;

  // 3. что это и чем не является
  r = disclaimerSection(dev, y);
  parts.push(r.svg);
  y += r.h;

  // 4. тарифы
  r = pricingSection(dev, y);
  parts.push(r.svg);
  spots.push(...r.spots);
  y += r.h;

  // 5. доверие (фон-полоса: высоту считаем «пробным» проходом)
  const probe = trustSection(dev, y, y + 1000);
  const tr = trustSection(dev, y, y + probe.h);
  parts.push(tr.svg);
  y += tr.h;

  // 6. FAQ
  r = faqSection(dev, y);
  parts.push(r.svg);
  y += r.h;

  // 7. блок регистрации по телефону
  const wl = registerSection(dev, y);
  parts.push(wl.bg, wl.svg);
  spots.push(...wl.spots);
  y += wl.h;

  // 8. футер
  const f = footer(dev, y);
  parts.push(f.bg, f.svg);
  y += f.h;

  return { svg: K.svgOpen(m.w, y, '#FFFFFF') + parts.join('') + '</svg>', spots, w: m.w, h: y };
}

/**
 * Отдельный экран на тёмном фоне: шапка + центрированный заголовок + карточка.
 * Используется экранами регистрации, кода и успеха.
 */
function darkScreen(dev, opts) {
  const isD = dev === 'desktop';
  const m = isD ? D : M;
  const pad = m.pad;
  const s = [];
  const spots = [];
  const n = nav(dev);
  s.push(n.svg);
  spots.push(...n.spots);

  const cardW = opts.cardW || (isD ? 560 : m.w - pad * 2);
  // Две карточки рядом: они расходятся от центра симметрично, иначе вторая
  // встаёт по координатам одиночной карточки и наезжает на первую.
  const twoUp = (opts.cards || []).length > 1 && isD;
  const cardX = twoUp ? m.w / 2 + 20 : isD ? (m.w - cardW) / 2 : pad;
  const top = n.h + (isD ? 64 : 32);
  let head = '';
  let headH = isD ? 12 : 8;
  if (opts.title) {
    // Высоту подзаголовка считаем по измеренной высоте заголовка: на телефоне он
    // переносится в две строки, и фиксированный отступ давал наложение строк.
    const h = K.textBlock({
      x: m.w / 2,
      y: top + (isD ? 40 : 32),
      text: opts.title,
      size: isD ? 38 : 26,
      weight: 700,
      color: '#FFFFFF',
      anchor: 'middle',
      maxWidth: isD ? 800 : m.w - pad * 2,
      lh: isD ? 48 : 34,
    });
    head = h.svg;
    headH = (isD ? 40 : 32) + h.height;
    if (opts.sub) {
      const sb = K.textBlock({
        x: m.w / 2,
        y: top + headH + 8,
        text: opts.sub,
        size: isD ? 16 : 14,
        color: C.blue200,
        anchor: 'middle',
        maxWidth: isD ? 620 : m.w - pad * 2,
        lh: isD ? 26 : 22,
      });
      head += sb.svg;
      headH += 8 + sb.height;
    }
    headH += isD ? 26 : 20;
  }

  let y = top + headH;
  const sh = (c) =>
    Object.assign({}, c, {
      x: c.x + cardX,
      y: c.y + y,
      hit: c.hit ? { x: c.hit.x + cardX, y: c.hit.y + y, w: c.hit.w, h: c.hit.h } : undefined,
    });

  const controls = [];
  const placements = [];
  const cards = opts.cards || [];
  // Зона, которую в прототипе рисует настоящий контрол, из статичного макета уходит:
  // иначе по одной точке две кликабельные цели и перехват клика.
  const covers = (sp, c) => c.to === sp.to && sp.x < c.x + c.w && c.x < sp.x + sp.w && sp.y < c.y + c.h && c.y < sp.y + sp.h;
  const rowY = y;
  let rowH = 0;
  cards.forEach((card, i) => {
    const cx = twoUp && i === 0 ? m.w / 2 - cardW - 20 : cardX;
    // В две колонки карточки стоят на одной линии: иначе вторая уезжает вниз,
    // а половина кадра остаётся пустой.
    const cy2 = twoUp ? rowY : y;
    placements.push({ x: cx, y: cy2 });
    s.push(K.group([card.svg], `translate(${cx},${cy2})`));
    const ctl = card.controls || [];
    const drawn = card.spots.filter((sp) => !ctl.some((c) => covers(sp, c)));
    spots.push(...drawn.map((sp) => spot(sp.x + cx, sp.y + cy2, sp.w, sp.h, sp.to, sp.label)));
    ctl.forEach((c) => controls.push(sh(Object.assign({}, c, { x: c.x + cx - cardX, y: c.y + (cy2 - y) }))));
    rowH = Math.max(rowH, card.h);
    if (!twoUp) y += card.h + (isD ? 40 : 24);
  });
  if (twoUp) y = rowY + rowH + 40;

  y += isD ? 40 : 24;
  const bg =
    `<defs><linearGradient id="wl2" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="#102A57"/><stop offset="100%" stop-color="#0B1B3C"/></linearGradient></defs>` +
    K.rect(0, n.h, m.w, y - n.h, { fill: 'url(#wl2)' });
  return {
    svg: K.svgOpen(m.w, y, '#FFFFFF') + bg + s.join('') + head + '</svg>',
    spots,
    controls,
    placements,
    w: m.w,
    h: y,
  };
}

/** Экран 1. Форма регистрации по телефону. state: form | error */
function buildRegister(dev, state = 'form') {
  return darkScreen(dev, {
    title: L.register.h2,
    sub: L.register.sub,
    cards: [registerCard(dev, dev === 'desktop' ? 560 : M.w - M.pad * 2, state)],
  });
}

/** Экран 2. Ввод кода из SMS. state: input | error | blocked */
function buildCode(dev, state = 'input') {
  const isD = dev === 'desktop';
  const cardW = isD ? 520 : M.w - M.pad * 2;
  const card = codeCard(dev, cardW, state);
  const r = darkScreen(dev, {
    title: L.code.h2,
    sub: 'Мы отправили код на номер ' + L.code.phoneMasked + '.',
    cardW,
    cards: [card, smsHintCard(dev, cardW)],
  });
  // Геометрия поля кода в координатах экрана — по ней прототип кладёт настоящее поле
  const p = r.placements[0];
  return Object.assign(r, {
    digitInput: {
      x: p.x + card.digitInput.x,
      y: p.y + card.digitInput.y,
      w: card.digitInput.w,
      h: card.digitInput.h,
    },
  });
}

/** Экран успеха после верификации кода. */
function buildRegisterSuccess(dev) {
  return darkScreen(dev, {
    title: L.register.successTitle,
    cards: [successCard(dev)],
  });
}

function successCard(dev) {
  const isD = dev === 'desktop';
  const pad = isD ? 36 : 22;
  const w = isD ? 560 : M.w - M.pad * 2;
  const iw = w - pad * 2;
  const s = [];
  const spots = [];
  let y = pad;
  s.push(
    `<defs><filter id="cardShadow" x="-25%" y="-25%" width="150%" height="150%">` +
      `<feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#04102A" flood-opacity="0.28"/></filter></defs>`,
  );
  const bodyStart = s.length;
  s.push(K.iconBadge(pad, y, isD ? 56 : 48, 'check', { bg: C.greenBg, fg: C.green, iconSize: isD ? 28 : 24 }));
  y += (isD ? 56 : 48) + 26;
  // Заголовок экрана уже стоит над карточкой (darkScreen) — в карточке не дублируем.
  const t = K.textBlock({ x: pad, y, text: L.register.successText, size: isD ? 15 : 14, color: C.ink2, maxWidth: iw, lh: isD ? 23 : 21 });
  s.push(t.svg);
  y += t.height + 14;
  s.push(K.roundRect(pad, y, iw, isD ? 50 : 46, 12, { fill: C.bg2, stroke: C.line }));
  s.push(K.textBlock({ x: pad + 16, y: y + (isD ? 32 : 29), text: L.register.successPhone, size: isD ? 15.5 : 15, weight: 600, color: C.ink }).svg);
  y += (isD ? 50 : 46) + 18;
  s.push(K.button(pad, y, iw, isD ? 54 : 50, L.register.successCta, 'primary', isD ? 15.5 : 15));
  spots.push(spot(pad, y, iw, isD ? 54 : 50, 'lk-airport', L.register.successCta));
  y += (isD ? 54 : 50) + pad;
  const H = y;
  return { svg: withCard(s, bodyStart, w, H), w, h: H, spots, controls: [] };
}

module.exports = { buildLanding, buildRegister, buildCode, buildRegisterSuccess, D, M, spot };
