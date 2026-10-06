'use strict';

const fontkit = require('fontkit');
const nodePath = require('path');
const { C, F } = require('./theme');

const FONT_DIR = process.env.SAF_FONT_DIR;
const load = (f) => fontkit.openSync(nodePath.join(FONT_DIR, f));
const FONTS = {
  400: load('Inter_400Regular.ttf'),
  500: load('Inter_500Medium.ttf'),
  600: load('Inter_600SemiBold.ttf'),
  700: load('Inter_700Bold.ttf'),
};
const widthCache = new Map();

/** Стек шрифтов: Inter — в PNG (resvg) и в прототипе (встроен в fonts.css), далее системный fallback. */
const FONT_STACK = "Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Точная ширина строки в px для заданного кегля. */
/** Ширина строки в px: раскладка в юнитах шрифта, приведённая к кеглю. */
function measure(text, size, weight = 400, ls = 0) {
  const key = weight + '|' + text;
  let em = widthCache.get(key);
  if (em === undefined) {
    const f = FONTS[weight] || FONTS[400];
    em = f.layout(String(text)).advanceWidth / f.unitsPerEm;
    widthCache.set(key, em);
  }
  return em * size + Math.max(0, String(text).length - 1) * ls;
}

/** Перенос строк по максимальной ширине (жадный, по словам; перенос длинных слов). */
function wrap(text, size, weight, maxWidth, ls = 0) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const cand = line ? line + ' ' + w : w;
      if (measure(cand, size, weight, ls) <= maxWidth || !line) {
        line = cand;
      } else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Текстовый блок. Возвращает { svg, height }.
 * anchor: start | middle | end
 * join: узел намеренно примыкает к соседнему (маска телефона «+7 » + «___»),
 *       рисуется вплотную без зазора — детектор слипания такие пары пропускает.
 */
function textBlock(opts) {
  const {
    x,
    y,
    text,
    size = 16,
    weight = 400,
    color = C.ink,
    maxWidth = null,
    lh = Math.round(size * 1.45),
    anchor = 'start',
    ls = 0,
    opacity = 1,
    join = false,
  } = opts;
  const lines = maxWidth ? wrap(text, size, weight, maxWidth, ls) : String(text).split('\n');
  const parts = lines.map((ln, i) => {
    const yy = y + i * lh;
    const attrs = [
      `x="${x}"`,
      `y="${yy}"`,
      `font-family="${FONT_STACK}"`,
      `font-size="${size}"`,
      `font-weight="${weight}"`,
      `fill="${color}"`,
    ];
    if (anchor !== 'start') attrs.push(`text-anchor="${anchor}"`);
    if (ls) attrs.push(`letter-spacing="${ls}"`);
    if (opacity !== 1) attrs.push(`opacity="${opacity}"`);
    if (join) attrs.push('data-join="1"');
    return `<text ${attrs.join(' ')}>${esc(ln)}</text>`;
  });
  // высота: от базовой линии первой строки
  const height = (lines.length - 1) * lh + Math.round(size * 1.2);
  return { svg: parts.join(''), height, lines };
}

function rect(x, y, w, h, attrs = {}) {
  const a = [`x="${x}"`, `y="${y}"`, `width="${w}"`, `height="${h}"`];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    a.push(`${k}="${v}"`);
  }
  return `<rect ${a.join(' ')}/>`;
}

function roundRect(x, y, w, h, r, attrs = {}) {
  const a = [
    `x="${x}"`,
    `y="${y}"`,
    `width="${w}"`,
    `height="${h}"`,
    `rx="${r}"`,
    `ry="${r}"`,
  ];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    a.push(`${k}="${v}"`);
  }
  return `<rect ${a.join(' ')}/>`;
}

function line(x1, y1, x2, y2, color = C.line, w = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;
}

function circle(cx, cy, r, attrs = {}) {
  const a = [`cx="${cx}"`, `cy="${cy}"`, `r="${r}"`];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    a.push(`${k}="${v}"`);
  }
  return `<circle ${a.join(' ')}/>`;
}

function path(d, attrs = {}) {
  const a = [`d="${d}"`];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    a.push(`${k}="${v}"`);
  }
  return `<path ${a.join(' ')}/>`;
}

/** Кнопка. variant: primary | secondary | ghost | light */
function button(x, y, w, h, label, variant = 'primary', size = 16) {
  const r = h / 2;
  let bg = C.navy700;
  let fg = '#FFFFFF';
  let stroke = null;
  if (variant === 'secondary') {
    bg = 'none';
    fg = C.navy700;
    stroke = C.navy700;
  } else if (variant === 'light') {
    bg = '#FFFFFF';
    fg = C.navy900;
  } else if (variant === 'ghost') {
    bg = 'none';
    fg = C.blue200;
    stroke = 'rgba(255,255,255,0.35)';
  } else if (variant === 'danger') {
    bg = 'none';
    fg = C.alert;
    stroke = C.alertLine;
  }
  let s = '';
  if (bg !== 'none') {
    s += roundRect(x, y, w, h, r, { fill: bg });
  } else if (stroke) {
    s += roundRect(x, y, w, h, r, { fill: 'none', stroke, 'stroke-width': 1.5 });
  }
  const t = textBlock({ x: x + w / 2, y: y + h / 2 + size * 0.36, text: label, size, weight: 600, color: fg, anchor: 'middle' });
  return s + t.svg;
}

/** Чип/плашка. tone: neutral | green | amber | alert | onDark | blue */
function chip(x, y, label, opts = {}) {
  const { size = 13, tone = 'neutral', weight = 600, padX = 12, h = 28 } = opts;
  const tones = {
    neutral: { bg: C.bg3, fg: C.ink2 },
    blue: { bg: C.blue50, fg: C.navy700 },
    green: { bg: C.greenBg, fg: C.green },
    amber: { bg: C.amberBg, fg: C.amber },
    alert: { bg: C.alertBg, fg: C.alert },
    onDark: { bg: 'rgba(255,255,255,0.12)', fg: '#DCE6F8' },
  };
  const t = tones[tone] || tones.neutral;
  const w = Math.round(measure(label, size, weight) + padX * 2);
  const s =
    roundRect(x, y, w, h, h / 2, { fill: t.bg }) +
    textBlock({ x: x + padX, y: y + h / 2 + size * 0.36, text: label, size, weight, color: t.fg }).svg;
  return { svg: s, w, h };
}

/** Иконки-«линии» 24×24, рисуются от левого верхнего угла бокса size. */
function icon(name, x, y, size = 24, color = C.navy700, strokeW = 1.8) {
  const s = size / 24;
  const g = `translate(${x},${y}) scale(${s})`;
  const st = { fill: 'none', stroke: color, 'stroke-width': strokeW, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const shapes = {
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3c0 1.1-.9 2-2 2A16.5 16.5 0 0 1 4.5 5.5c0-1.1.9-2 2-2Z"/>',
    bell: '<path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.5h14l-1.5-3.3V9A5.5 5.5 0 0 0 12 3.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4 3 7.2 7 9 4-1.8 7-5 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.8" cy="6.5" r="1.3"/><circle cx="4.8" cy="12" r="1.3"/><circle cx="4.8" cy="17.5" r="1.3"/>',
    gear: '<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h10M18 17h2"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="16" cy="17" r="2.2"/>',
    card: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 10h17"/>',
    home: '<path d="M4.5 10.5 12 4.5l7.5 6V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8.5Z"/><path d="M10 20v-5.5h4V20"/>',
    user: '<circle cx="12" cy="8.5" r="3.7"/><path d="M4.8 20c1.2-3.6 3.9-5.4 7.2-5.4S18 16.4 19.2 20"/>',
    users:
      '<circle cx="9.5" cy="8.5" r="3.4"/><path d="M3 19.5c1.1-3.3 3.6-5 6.5-5s5.4 1.7 6.5 5"/><path d="M16 5.4a3.4 3.4 0 0 1 0 6.6M18 14.8c1.7.7 2.8 2.2 3.3 4.2"/>',
    building:
      '<rect x="4.5" y="4.5" width="9" height="15" rx="1.2"/><path d="M13.5 9.5h6v10h-6"/><path d="M7.5 8.5h3M7.5 12h3M7.5 15.5h3"/>',
    arrow: '<path d="M5 12h13.5M13 6.5l5.5 5.5L13 17.5"/>',
    lock: '<rect x="4.8" y="10.5" width="14.4" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5Z"/>',
    wifi: '<path d="M4 9.5a12 12 0 0 1 16 0M7 13a8 8 0 0 1 10 0M10 16.4a3.6 3.6 0 0 1 4 0"/><circle cx="12" cy="19.4" r="1.2" fill="' + color + '" stroke="none"/>',
    doc: '<path d="M6.5 3.5h7l4.5 4.5v12.5h-11.5Z"/><path d="M13.5 3.5V8H18"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    mug: '<path d="M4.5 6.5h11v8a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4v-8Z"/><path d="M15.5 8.5h2.2a2.3 2.3 0 0 1 0 4.6h-2.2"/>',
  };
  const body = shapes[name] || shapes.check;
  return `<g transform="${g}" ${Object.entries(st)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')}>${body}</g>`;
}

/** Иконка в цветном круге. */
function iconBadge(x, y, d, iconName, opts = {}) {
  const { bg = C.blue50, fg = C.navy700, iconSize = Math.round(d * 0.5) } = opts;
  return (
    circle(x + d / 2, y + d / 2, d / 2, { fill: bg }) +
    icon(iconName, x + (d - iconSize) / 2, y + (d - iconSize) / 2, iconSize, fg)
  );
}

function svgOpen(w, h, bg = '#FFFFFF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    rect(0, 0, w, h, { fill: bg });
}

function group(children, transform = null) {
  const t = transform ? ` transform="${transform}"` : '';
  return `<g${t}>${children.join('')}</g>`;
}

module.exports = { esc, measure, wrap, textBlock, rect, roundRect, line, circle, path, button, chip, icon, iconBadge, svgOpen, group, FONTS };
