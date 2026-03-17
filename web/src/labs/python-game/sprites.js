/**
 * Built-in pixel art sprites for the Py Game Maker.
 *
 * Each sprite definition:
 *   cat   - category id
 *   fps   - animation speed (only for multi-frame, default 4)
 *   data  - array of frames; each frame is an array of 8-char strings
 *
 * Characters in rows map to colors via PALETTE. '.' = transparent.
 */

const PALETTE = {
  '.': null,
  'b': '#4a9eff', 'B': '#2563eb',
  'r': '#ef4444', 'R': '#b91c1c',
  'g': '#4ade80', 'G': '#16a34a',
  'y': '#fbbf24', 'Y': '#d97706',
  'w': '#ffffff', 'W': '#d1d5db',
  'k': '#1f2937', 'K': '#000000',
  'o': '#fb923c', 'O': '#ea580c',
  'c': '#22d3ee', 'C': '#0891b2',
  'p': '#f472b6', 'P': '#db2777',
  'n': '#a3763d', 'N': '#78552b',
  's': '#cbd5e1', 'S': '#94a3b8',
  'v': '#a78bfa', 'V': '#7c3aed',
  'l': '#a3e635', 'L': '#65a30d',
};

export const CATEGORIES = [
  { id: 'characters', name: 'Characters' },
  { id: 'items',      name: 'Items & Weapons' },
  { id: 'environment',name: 'Environment' },
  { id: 'animals',    name: 'Animals' },
  { id: 'ui',         name: 'UI & Icons' },
  { id: 'vehicles',   name: 'Vehicles' },
  { id: 'effects',    name: 'Effects' },
];

const DEFS = {
  // ===================== CHARACTERS =====================
  player: { cat: 'characters', data: [[
    '...BB...',
    '..BBBB..',
    '..BwkB..',
    '...BB...',
    '..oBBo..',
    '.oBBBBo.',
    '..B..B..',
    '..k..k..',
  ]]},
  player_run: { cat: 'characters', fps: 6, data: [
    [ '...BB...', '..BBBB..', '..BwkB..', '...BB...',
      '..oBBo..', '.oBBBBo.', '..B..B..', '.k....k.' ],
    [ '...BB...', '..BBBB..', '..BwkB..', '...BB...',
      '..oBBo..', '.oBBBBo.', '..kBBk..', '........' ],
  ]},
  player2: { cat: 'characters', data: [[
    '...rr...',
    '..rrrr..',
    '..rwkr..',
    '...rr...',
    '..grRg..',
    '.grrrrg.',
    '..r..r..',
    '..k..k..',
  ]]},
  enemy: { cat: 'characters', data: [[
    '.rr..rr.',
    'rrrrrrrr',
    'rrwkwkrr',
    'rrrrrrrr',
    'rRrrrRrr',
    '.rRRRRr.',
    '..rrrr..',
    '.r....r.',
  ]]},
  enemy_walk: { cat: 'characters', fps: 5, data: [
    [ '.rr..rr.', 'rrrrrrrr', 'rrwkwkrr', 'rrrrrrrr',
      'rRrrrRrr', '.rRRRRr.', '..rrrr..', 'r......r' ],
    [ '.rr..rr.', 'rrrrrrrr', 'rrwkwkrr', 'rrrrrrrr',
      'rRrrrRrr', '.rRRRRr.', '..rrrr..', '.r....r.' ],
  ]},
  ghost: { cat: 'characters', data: [[
    '..wwww..',
    '.wwwwww.',
    'wwkwwkww',
    'wwwwwwww',
    'wwwwwwww',
    'wwwwwwww',
    'w.ww.ww.',
    '........',
  ]]},
  slime: { cat: 'characters', data: [[
    '........',
    '...gg...',
    '..gggg..',
    '.gGwkGg.',
    '.gggggg.',
    'gGggggGg',
    'gggggggg',
    '.g.gg.g.',
  ]]},
  wizard: { cat: 'characters', data: [[
    '...vV...',
    '..vVVv..',
    '..vVVv..',
    '..vwkv..',
    '...vv...',
    '..VvvV..',
    '..vVVv..',
    '..k..k..',
  ]]},
  knight: { cat: 'characters', data: [[
    '..ssss..',
    '.sSSSss.',
    '.swwkSs.',
    '..ssss..',
    '.sSSSss.',
    '.sSSSss.',
    '..ssss..',
    '..k..k..',
  ]]},
  skeleton: { cat: 'characters', data: [[
    '..wwww..',
    '.wkwwkw.',
    '..wwww..',
    '...WW...',
    '..WWWW..',
    '.W.WW.W.',
    '..W..W..',
    '..w..w..',
  ]]},
  ninja: { cat: 'characters', data: [[
    '..kkkk..',
    '.kkkkkk.',
    '.kwwkkk.',
    '..kkkk..',
    '.kKKKkk.',
    '.kKKKkk.',
    '..kkkk..',
    '..k..k..',
  ]]},
  princess: { cat: 'characters', data: [[
    '..yyyy..',
    '.ypppyy.',
    '.ypwky..',
    '..yyy...',
    '.ppPPpp.',
    '.pPPPPp.',
    '..pppp..',
    '..n..n..',
  ]]},
  robot: { cat: 'characters', data: [[
    '.ssssss.',
    '.sSwwSs.',
    '.sskkss.',
    '..ssss..',
    '.sBBBBs.',
    '.sBsBBs.',
    '..ssss..',
    '..s..s..',
  ]]},
  zombie: { cat: 'characters', data: [[
    '..GGgg..',
    '.GGGGgg.',
    '.Gwkggg.',
    '..GGgg..',
    '.NNGGNg.',
    '.NgGGNg.',
    '..NNgg..',
    '..k..k..',
  ]]},

  // ===================== ITEMS & WEAPONS =====================
  coin: { cat: 'items', data: [[
    '..yyyy..',
    '.yYYYYy.',
    'yYY.YYYy',
    'yYY..YYy',
    'yYY..YYy',
    'yYY.YYYy',
    '.yYYYYy.',
    '..yyyy..',
  ]]},
  coin_spin: { cat: 'items', fps: 6, data: [
    [ '..yyyy..', '.yYYYYy.', 'yYY.YYYy', 'yYY..YYy',
      'yYY..YYy', 'yYY.YYYy', '.yYYYYy.', '..yyyy..' ],
    [ '...yy...', '..yYYy..', '.yYYYYy.', '.yY..Yy.',
      '.yY..Yy.', '.yYYYYy.', '..yYYy..', '...yy...' ],
    [ '....y...', '...yYy..', '..yYYy..', '..yYYy..',
      '..yYYy..', '..yYYy..', '...yYy..', '....y...' ],
    [ '...yy...', '..yYYy..', '.yYYYYy.', '.yY..Yy.',
      '.yY..Yy.', '.yYYYYy.', '..yYYy..', '...yy...' ],
  ]},
  gem: { cat: 'items', data: [[
    '........',
    '..cccc..',
    '.cCCCCc.',
    'cCCccCCc',
    'cCccccCc',
    '.cCCCCc.',
    '..cCCc..',
    '...cc...',
  ]]},
  key: { cat: 'items', data: [[
    '........',
    '..yyy...',
    '.y.y.y..',
    '..yyy...',
    '...y....',
    '...yy...',
    '...y....',
    '...yy...',
  ]]},
  sword: { cat: 'items', data: [[
    '......ww',
    '.....wSw',
    '....wSw.',
    '...wSw..',
    'y.wSw...',
    'yyww....',
    '.yy.....',
    '........',
  ]]},
  shield: { cat: 'items', data: [[
    '.BBBBBB.',
    'BBBBBBBB',
    'BBbyyBBB',
    'BByyyyBB',
    'BBbyyBBB',
    '.BBBBBB.',
    '..BBBB..',
    '...BB...',
  ]]},
  potion: { cat: 'items', data: [[
    '...ss...',
    '..sWWs..',
    '...ss...',
    '..vvvv..',
    '.vVvvVv.',
    '.vvVVvv.',
    '.vVvvVv.',
    '..vvvv..',
  ]]},
  potion_red: { cat: 'items', data: [[
    '...ss...',
    '..sWWs..',
    '...ss...',
    '..rrrr..',
    '.rRrrRr.',
    '.rrRRrr.',
    '.rRrrRr.',
    '..rrrr..',
  ]]},
  bomb: { cat: 'items', data: [[
    '....yo..',
    '...y....',
    '..kkkk..',
    '.kKKKKk.',
    'kKKwKKKk',
    'kKKKKKKk',
    '.kKKKKk.',
    '..kkkk..',
  ]]},
  chest: { cat: 'items', data: [[
    '.nnnnnn.',
    'nNnnnNnn',
    'nnnnnnnn',
    'nnyyyNnn',
    'nnNNNnnn',
    'nNnnnNnn',
    'nnnnnnnn',
    '........',
  ]]},
  crown: { cat: 'items', data: [[
    '........',
    'y..yy..y',
    'yy.yy.yy',
    'yyyyyyyy',
    'yYrYYrYy',
    'yyyyyyyy',
    '.yYYYYy.',
    '........',
  ]]},
  apple: { cat: 'items', data: [[
    '....n...',
    '...gg...',
    '..rrrr..',
    '.rrrrrr.',
    'rrRRrrrr',
    '.rRRRrr.',
    '..rrrr..',
    '........',
  ]]},
  book: { cat: 'items', data: [[
    '..nnnn..',
    '.nNwwNn.',
    '.nwwwwn.',
    '.nwkwwn.',
    '.nwwwwn.',
    '.nwwwwn.',
    '.nNNNNn.',
    '..nnnn..',
  ]]},
  ring: { cat: 'items', data: [[
    '........',
    '..yyyy..',
    '.y....y.',
    'y.yYYy.y',
    'y.yYYy.y',
    '.y....y.',
    '..yyyy..',
    '........',
  ]]},
  lantern: { cat: 'items', data: [[
    '...ss...',
    '..yyyy..',
    '..ykky..',
    '.yoOOoy.',
    '.yOOOOy.',
    '.yoOOoy.',
    '..yyyy..',
    '...kk...',
  ]]},

  // ===================== ENVIRONMENT =====================
  tree: { cat: 'environment', data: [[
    '...GG...',
    '..GGGG..',
    '.GgGGgG.',
    'GgGGGGgG',
    '.GgGGgG.',
    '..GGGG..',
    '...nn...',
    '...nn...',
  ]]},
  mushroom: { cat: 'environment', data: [[
    '..rrrr..',
    '.rwrwrr.',
    'rrrrrrrr',
    'rrrrrrrr',
    '..wwww..',
    '..wWWw..',
    '.wwWWww.',
    '.wwwwww.',
  ]]},
  rock: { cat: 'environment', data: [[
    '........',
    '..sSss..',
    '.sSSSss.',
    'sSSSkSSs',
    'SSSSSSks',
    '.sSSSss.',
    '..ssss..',
    '........',
  ]]},
  flower: { cat: 'environment', data: [[
    '........',
    '...rr...',
    '..rRRr..',
    '.rRyyRr.',
    '..rRRr..',
    '...gg...',
    '...gg...',
    '..llll..',
  ]]},
  flower_sway: { cat: 'environment', fps: 3, data: [
    [ '........', '...rr...', '..rRRr..', '.rRyyRr.',
      '..rRRr..', '...gg...', '...gg...', '..llll..' ],
    [ '........', '..rr....', '.rRRr...', 'rRyyRr..',
      '.rRRr...', '..gg....', '..gg....', '.llll...' ],
  ]},
  cactus: { cat: 'environment', data: [[
    '...GG...',
    '...GG...',
    'G..GG..G',
    'GG.GG.GG',
    '.GGGGGG.',
    '...GG...',
    '...GG...',
    '..nnnn..',
  ]]},
  door: { cat: 'environment', data: [[
    '.nnnnnn.',
    '.nNNNNn.',
    '.nNNNNn.',
    '.nNNNNn.',
    '.nNyNNn.',
    '.nNNNNn.',
    '.nNNNNn.',
    '.nNNNNn.',
  ]]},
  cloud: { cat: 'environment', data: [[
    '........',
    '..www...',
    '.wwwww..',
    'wwwwwwww',
    'wWWwwWww',
    '.wwwwww.',
    '........',
    '........',
  ]]},
  house: { cat: 'environment', data: [[
    '...rr...',
    '..rrrr..',
    '.rrrrrr.',
    'rrrrrrrr',
    'nnwwwwnn',
    'nnwBwwnn',
    'nnwBwwnn',
    'nnnnnnnn',
  ]]},
  water: { cat: 'environment', fps: 3, data: [
    [ '........', 'bBbBbBbB', 'BbBbBbBb', 'bBbBbBbB',
      'BbBbBbBb', 'bBbBbBbB', 'BbBbBbBb', '........' ],
    [ '........', 'BbBbBbBb', 'bBbBbBbB', 'BbBbBbBb',
      'bBbBbBbB', 'BbBbBbBb', 'bBbBbBbB', '........' ],
  ]},
  fence: { cat: 'environment', data: [[
    'n..n..n.',
    'n..n..n.',
    'nnnnnnnn',
    'n..n..n.',
    'n..n..n.',
    'nnnnnnnn',
    'n..n..n.',
    'n..n..n.',
  ]]},

  // ===================== ANIMALS =====================
  bat: { cat: 'animals', data: [[
    '........',
    'v..vv..v',
    'vv.vv.vv',
    'vvvvvvvv',
    '.vvwkvv.',
    '..vvvv..',
    '...vv...',
    '........',
  ]]},
  bat_fly: { cat: 'animals', fps: 6, data: [
    [ '........', 'v..vv..v', 'vv.vv.vv', 'vvvvvvvv',
      '.vvwkvv.', '..vvvv..', '...vv...', '........' ],
    [ '........', '...vv...', '..vvvv..', '.vvvvvv.',
      '.vvwkvv.', 'vvvvvvvv', '...vv...', '........' ],
  ]},
  fish: { cat: 'animals', data: [[
    '........',
    '...bbb..',
    'b.bBBBb.',
    'bbbwkBBb',
    'b.bBBBb.',
    '...bbb..',
    '........',
    '........',
  ]]},
  bird: { cat: 'animals', data: [[
    '........',
    '..rrr...',
    '.rRRRr..',
    '.rwkRRr.',
    '.rRRRr..',
    '..rrr...',
    '........',
    '........',
  ]]},
  bird_fly: { cat: 'animals', fps: 6, data: [
    [ '........', '..rrr...', '.rRRRr..', '.rwkRr..',
      '.rRRRr..', '..rrr...', '.r...r..', '........' ],
    [ '.r...r..', '..rrr...', '.rRRRr..', '.rwkRr..',
      '.rRRRr..', '..rrr...', '........', '........' ],
  ]},
  cat: { cat: 'animals', data: [[
    '.o...o..',
    '.oo.oo..',
    '.ooooo..',
    '.owkowk.',
    '.ooooo..',
    '..ooo...',
    '.ooooo..',
    '..o..o..',
  ]]},
  dog: { cat: 'animals', data: [[
    '.nn.....',
    '.nnn....',
    '.nnnnn..',
    '.nwknnn.',
    '.nnnnn..',
    '..nnn...',
    '.nnnnn..',
    '..n..n..',
  ]]},
  frog: { cat: 'animals', data: [[
    '........',
    '.g..g...',
    'ggwkgwk.',
    'ggggggg.',
    '.gGGGg..',
    '.ggggg..',
    'g.ggg.g.',
    '........',
  ]]},
  butterfly: { cat: 'animals', fps: 5, data: [
    [ 'pp..pp..', 'pPp.pPp.', 'ppppppk.', '.pPpPp..',
      'ppppppk.', 'pPp.pPp.', 'pp..pp..', '........' ],
    [ '........', '.pp..pp.', '.pPppPpk', '..pPpP..',
      '.pPppPpk', '.pp..pp.', '........', '........' ],
  ]},
  snake: { cat: 'animals', data: [[
    '........',
    '........',
    '..gg....',
    '.gwkg...',
    '..gggg..',
    '....ggg.',
    '.....gg.',
    '......g.',
  ]]},
  rabbit: { cat: 'animals', data: [[
    '..w..w..',
    '..ww.ww.',
    '..wwww..',
    '.wwkwkw.',
    '.wwpwww.',
    '..wwww..',
    '.wwwwww.',
    '..w..w..',
  ]]},

  // ===================== UI & ICONS =====================
  star: { cat: 'ui', data: [[
    '...yy...',
    '...yy...',
    '.yyyyyy.',
    'yyyyyyyy',
    '.yYYYYy.',
    '..yYYy..',
    '.yy..yy.',
    'yy....yy',
  ]]},
  heart: { cat: 'ui', data: [[
    '........',
    '.rr..rr.',
    'rrrrrrrr',
    'rrrrrrrr',
    'rrrrrrrr',
    '.rrrrrr.',
    '..rrrr..',
    '...rr...',
  ]]},
  arrow_up: { cat: 'ui', data: [[
    '...ww...',
    '..wwww..',
    '.wwwwww.',
    'wwwWWwww',
    '...WW...',
    '...WW...',
    '...WW...',
    '...WW...',
  ]]},
  arrow_right: { cat: 'ui', data: [[
    '........',
    '...w....',
    '...ww...',
    'wwwwwww.',
    'WWWWWWww',
    '...ww...',
    '...w....',
    '........',
  ]]},
  arrow_down: { cat: 'ui', data: [[
    '...WW...',
    '...WW...',
    '...WW...',
    '...WW...',
    'wwwWWwww',
    '.wwwwww.',
    '..wwww..',
    '...ww...',
  ]]},
  arrow_left: { cat: 'ui', data: [[
    '........',
    '....w...',
    '...ww...',
    '.wwwwwww',
    'wwWWWWWW',
    '...ww...',
    '....w...',
    '........',
  ]]},
  flag: { cat: 'ui', data: [[
    'rrrrrr..',
    'rRRRRr..',
    'rrrrrr..',
    'rRRRRr..',
    'rrrrrr..',
    '.....k..',
    '.....k..',
    '.....k..',
  ]]},
  skull: { cat: 'ui', data: [[
    '..wwww..',
    '.wwwwww.',
    'wwkwwkww',
    'wwwwwwww',
    '.wwwwww.',
    '..w.ww..',
    '..wwww..',
    '........',
  ]]},
  check: { cat: 'ui', data: [[
    '........',
    '........',
    '.......g',
    '......gg',
    '.g...gg.',
    '.gg.gg..',
    '..ggg...',
    '...g....',
  ]]},
  cross: { cat: 'ui', data: [[
    '........',
    '.r....r.',
    '..rr.rr.',
    '...rrr..',
    '...rrr..',
    '..rr.rr.',
    '.r....r.',
    '........',
  ]]},

  // ===================== VEHICLES =====================
  ship: { cat: 'vehicles', data: [[
    '...cc...',
    '...CC...',
    '..cCCc..',
    '..cCCc..',
    '.sCCCCs.',
    'ssCCCCss',
    '.sooCos.',
    '..oKKo..',
  ]]},
  rocket: { cat: 'vehicles', data: [[
    '...ww...',
    '..wsws..',
    '..wssw..',
    '.rwsswr.',
    '.rwsswr.',
    'rrwwwwrr',
    '.rorrOr.',
    '..oyyo..',
  ]]},
  car: { cat: 'vehicles', data: [[
    '........',
    '..rrrr..',
    '.rrrrrr.',
    'rrrrrrrr',
    'rBrrrrBr',
    'rrrrrrrr',
    '.kk..kk.',
    '........',
  ]]},
  ufo: { cat: 'vehicles', data: [[
    '...gg...',
    '..gGGg..',
    '.gGwwGg.',
    'ssssssss',
    'SsSsSsSS',
    '.ssssss.',
    '........',
    '........',
  ]]},
  boat: { cat: 'vehicles', data: [[
    '........',
    '....w...',
    '....nw..',
    '....nww.',
    '.nnnnnnn',
    '.nNNNNn.',
    '..nnnn..',
    '........',
  ]]},

  // ===================== EFFECTS =====================
  sparkle: { cat: 'effects', fps: 6, data: [
    [ '........', '...y....', '..yYy...', '.yYYYy..', '..yYy...',
      '...y....', '........', '........' ],
    [ '...y....', '........', '.y.Y.y..', '...Y....', '.y.Y.y..',
      '........', '...y....', '........' ],
  ]},
  fire: { cat: 'effects', fps: 5, data: [
    [ '........', '..y.....', '.yoy....', '.oOoy...', '.oOOo...', 'oOOOOo..',
      '.oOOo...', '..oo....' ],
    [ '........', '.....y..', '....yoy.', '...yoOo.', '...oOOo.', '..oOOOOo',
      '...oOOo.', '....oo..' ],
    [ '........', '...y....', '..yoy...', '.yoOoy..', '.oOOOo..', '.oOOOo..',
      '..oOOo..', '...oo...' ],
  ]},
  explosion: { cat: 'effects', fps: 4, data: [
    [ '........', '........', '...yy...', '..yOOy..', '..yOOy..', '...yy...',
      '........', '........' ],
    [ '........', '..yOy...', '.yOrOy..', 'yOrOrOy.', '.yOrOy..', '..yOy...',
      '........', '........' ],
    [ '.y....y.', '..yOOy..', '.yOrOry.', 'yOrOrOry', 'yOrOrOry', '.yOrOry.',
      '..yOOy..', '.y....y.' ],
  ]},
  poof: { cat: 'effects', fps: 4, data: [
    [ '........', '........', '..www...', '.wwWww..', '..www...', '........',
      '........', '........' ],
    [ '........', '.w.ww...', '..wwWw..', '.wWWWww.', '..wwWw..', '...ww.w.',
      '........', '........' ],
    [ 'w...w..w', '..w...w.', '.w.W.w..', '...W..w.', '.w.W.w..', '..w...w.',
      'w...w..w', '........' ],
  ]},
};

// ===================== EXPORTS =====================

export function parseSpriteData(rows) {
  return rows.map(row =>
    [...row].map(ch => PALETTE[ch] || null)
  );
}

export function renderPixelArt(pixelData, scale) {
  const rows = pixelData.length;
  const cols = pixelData[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = pixelData[r][c];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
  }
  return canvas;
}

/** First frame pixel data (backward compatible). */
export function getBuiltInSprite(name) {
  const def = DEFS[name];
  if (!def) return null;
  return parseSpriteData(def.data[0]);
}

/** Full sprite info: { category, fps, frames: [parsedPixelData, ...] } */
export function getSpriteInfo(name) {
  const def = DEFS[name];
  if (!def) return null;
  return {
    category: def.cat,
    fps: def.fps || 0,
    frameCount: def.data.length,
    frames: def.data.map(f => parseSpriteData(f)),
  };
}

export function getSpriteNames() {
  return Object.keys(DEFS);
}

export function getCategories() {
  return CATEGORIES;
}

/** Returns { categoryId: [name, ...], ... } */
export function getSpritesByCategory() {
  const result = {};
  for (const cat of CATEGORIES) result[cat.id] = [];
  for (const [name, def] of Object.entries(DEFS)) {
    if (result[def.cat]) result[def.cat].push(name);
  }
  return result;
}

export function parseCustomSprite(rows, colorMap) {
  return rows.map(row =>
    [...row].map(ch => {
      if (ch === '.' || ch === ' ') return null;
      return colorMap[ch] || null;
    })
  );
}
