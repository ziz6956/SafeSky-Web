'use strict';

// Единая дизайн-система SafeSky (лендинг + ЛК).
// Палитра спокойная: тёмно-синий + нейтральные тона. Тревожный красный — только
// точечно (статус «тревога»), без крупных масс.

const C = {
  navy950: '#08142E',
  navy900: '#0C1E43',
  navy800: '#12305F',
  navy700: '#1B4180',
  navy600: '#2A56A0',
  blue400: '#6F97E8',
  blue200: '#B9CDF2',
  blue50: '#EAF0FC',

  ink: '#0F1B33',
  ink2: '#31425F',
  muted: '#63748F',
  muted2: '#8A99B3',

  line: '#DDE4F0',
  line2: '#EDF1F8',
  bg: '#FFFFFF',
  bg2: '#F6F8FC',
  bg3: '#EEF2F9',

  green: '#1F8F63',
  greenBg: '#E4F5ED',
  greenLine: '#B7E3CE',

  amber: '#B57C12',
  amberBg: '#FCF2DF',
  amberLine: '#F0DBB0',

  alert: '#C0392B',
  alertBg: '#FBEAE8',
  alertLine: '#F0C7C1',
};

const F = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

// Сетка
const L = {
  desktop: { w: 1440, pad: 96, container: 1248 },
  mobile: { w: 390, pad: 20, container: 350 },
};

module.exports = { C, F, L };
