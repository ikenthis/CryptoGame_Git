import type { CardId, Race } from '@gentium/engine';

// Ilustraciones SVG de cartas y emblemas de raza (viewBox 64×64).

const svg = (body: string, defs = '') =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;

const grad = (id: string, a: string, b: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const radial = (id: string, a: string, b: string) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>`;

const O = 'stroke="#140f0a" stroke-width="1.6" stroke-linejoin="round"';

export const CARD_ART: Record<CardId, string> = {
  'fire-arrow': svg(
    `<circle cx="44" cy="20" r="16" fill="url(#fa-g)"/>
     <path d="M10 54 L46 18" stroke="#6b4524" stroke-width="3.5" stroke-linecap="round"/>
     <path d="M12 46 L6 50 L10 56 L16 52 Z M18 40 L12 44 L16 50" fill="#d9f0ff" ${O}/>
     <path d="M52 12 L40 18 L46 24 Z" fill="#ffd27a" ${O}/>
     <path d="M47 10 C58 12 56 26 48 24 C54 20 52 16 47 10 Z" fill="#ff7a1a"/>
     <path d="M50 14 C55 16 54 22 49 22 C52 19 51 17 50 14 Z" fill="#ffe27a"/>`,
    radial('fa-g', '#ffb347', '#ff5a1a')),
  'minor-potion': svg(
    `<circle cx="32" cy="38" r="22" fill="url(#mp-r)"/>
     <path d="M26 8 H38 V20 C48 24 52 32 50 42 C48 52 40 58 32 58 C24 58 16 52 14 42 C12 32 16 24 26 20 Z" fill="url(#mp-g)" ${O}/>
     <path d="M17 38 C24 34 40 42 47 36 C48 48 42 56 32 56 C22 56 16 48 17 38 Z" fill="#e0245e"/>
     <rect x="24" y="4" width="16" height="6" rx="2" fill="#8a5a33" ${O}/>
     <ellipse cx="24" cy="30" rx="3" ry="6" fill="#fff" opacity=".55"/>`,
    grad('mp-g', '#dff6ff', '#9cc9e8') + radial('mp-r', '#ff6b8a', '#e0245e')),
  'war-cry': svg(
    `<circle cx="32" cy="32" r="26" fill="url(#wc-r)"/>
     <path d="M10 38 C12 26 30 18 46 12 L50 30 C38 32 24 40 18 48 Z" fill="url(#wc-g)" ${O}/>
     <path d="M46 12 C52 14 56 24 50 30" fill="#5a3a1e" ${O}/>
     <path d="M20 20 l-6 -6 M26 16 l-2 -8 M14 28 l-8 -2" stroke="#ffd27a" stroke-width="2.4" stroke-linecap="round"/>
     <path d="M16 44 l8 10 M22 40 l6 10" stroke="#f4d06f" stroke-width="3" ${O}/>`,
    grad('wc-g', '#f4e2b8', '#b88a4a') + radial('wc-r', '#ff5a36', '#ff5a36')),
  'stone-skin': svg(
    `<path d="M32 4 L54 12 V30 C54 44 44 54 32 60 C20 54 10 44 10 30 V12 Z" fill="url(#ss-g)" ${O}/>
     <path d="M20 18 L28 28 L24 38 M40 16 L36 28 L44 36 M28 28 H36 M24 38 L32 48 L44 36" stroke="#3a342c" stroke-width="2" fill="none"/>
     <path d="M32 8 L50 14 V22 L32 16 L14 22 V14 Z" fill="#ffffff" opacity=".25"/>`,
    grad('ss-g', '#c9c0ad', '#5e564a')),
  'swift-wind': svg(
    `<path d="M6 22 H38 C46 22 48 12 42 10 C36 8 34 14 36 16" stroke="#b6f5c9" stroke-width="4" fill="none" stroke-linecap="round"/>
     <path d="M6 34 H50 C58 34 60 44 54 47 C48 50 45 44 48 42" stroke="#6dff9e" stroke-width="4" fill="none" stroke-linecap="round"/>
     <path d="M10 46 H30 C36 46 38 54 33 56" stroke="#3fbf6a" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  'frost-bind': svg(
    `<circle cx="32" cy="32" r="26" fill="url(#fb-r)"/>
     <g stroke="#e8f8ff" stroke-width="3.5" stroke-linecap="round">
       <path d="M32 6 V58 M9.5 19 L54.5 45 M9.5 45 L54.5 19"/>
       <path d="M26 10 L32 16 L38 10 M26 54 L32 48 L38 54 M12 26 L20 28 L18 20 M52 38 L44 36 L46 44 M12 38 L20 36 L18 44 M52 26 L44 28 L46 20"/>
     </g>
     <circle cx="32" cy="32" r="5" fill="#a8e8ff" ${O}/>`,
    radial('fb-r', '#6fd3ff', '#1f6fb4')),
  meteor: svg(
    `<path d="M4 4 L40 38 L30 44 Z" fill="url(#me-t)" opacity=".9"/>
     <path d="M14 2 L46 30 L38 36 Z" fill="#ffe27a" opacity=".6"/>
     <circle cx="42" cy="42" r="15" fill="url(#me-g)" ${O}/>
     <circle cx="37" cy="38" r="3.5" fill="#5a2a12"/><circle cx="47" cy="46" r="2.5" fill="#5a2a12"/><circle cx="46" cy="36" r="2" fill="#5a2a12"/>`,
    grad('me-g', '#ffb347', '#a8320c') + grad('me-t', '#ff7a1a', '#ff3b1f')),
  reinforcements: svg(
    `<path d="M10 54 L46 12 L52 8 L50 16 L14 58 Z" fill="url(#re-g)" ${O}/>
     <path d="M54 54 L18 12 L12 8 L14 16 L50 58 Z" fill="url(#re-g)" ${O}/>
     <path d="M10 46 L20 56 M54 46 L44 56" stroke="#f4d06f" stroke-width="5" stroke-linecap="round"/>
     <path d="M22 30 C22 18 42 18 42 30 V40 H22 Z" fill="#8fa3b8" ${O}/>
     <rect x="30" y="28" width="12" height="3" fill="#140f0a"/>`,
    grad('re-g', '#ffffff', '#8a97a6')),
  'healing-light': svg(
    `<circle cx="32" cy="32" r="28" fill="url(#hl-r)"/>
     <g stroke="#ffe27a" stroke-width="3" stroke-linecap="round">
       <path d="M32 2 V12 M32 52 V62 M2 32 H12 M52 32 H62 M11 11 L18 18 M46 46 L53 53 M53 11 L46 18 M11 53 L18 46"/>
     </g>
     <path d="M26 16 H38 V26 H48 V38 H38 V48 H26 V38 H16 V26 H26 Z" fill="#fffbe0" ${O}/>`,
    radial('hl-r', '#fff3b0', '#3fbf6a')),
  'chain-lightning': svg(
    `<circle cx="32" cy="32" r="26" fill="url(#cl-r)"/>
     <path d="M36 2 L14 34 H28 L22 62 L50 24 H34 L42 2 Z" fill="url(#cl-g)" ${O}/>`,
    grad('cl-g', '#ffffff', '#b98cff') + radial('cl-r', '#a84dff', '#3a1470')),
  resurrection: svg(
    `<circle cx="32" cy="26" r="24" fill="url(#rs-r)"/>
     <path d="M32 4 C22 4 20 20 28 26 H14 V34 H28 V60 H36 V34 H50 V26 H36 C44 20 42 4 32 4 Z M32 11 C37 11 37 21 32 24 C27 21 27 11 32 11 Z" fill="url(#rs-g)" ${O} fill-rule="evenodd"/>`,
    grad('rs-g', '#fff3b0', '#c98f1a') + radial('rs-r', '#ffe28a', '#a84dff')),
  'aurelia-intervention': svg(
    `<circle cx="32" cy="34" r="28" fill="url(#ai-r)"/>
     <path d="M4 30 C12 22 20 24 24 30 C18 30 14 34 12 40 C10 34 8 32 4 30 Z M60 30 C52 22 44 24 40 30 C46 30 50 34 52 40 C54 34 56 32 60 30 Z" fill="#fffbe0" ${O}/>
     <path d="M16 46 L12 20 L24 32 L32 14 L40 32 L52 20 L48 46 Z" fill="url(#ai-g)" ${O}/>
     <rect x="15" y="44" width="34" height="7" rx="2" fill="#c98f1a" ${O}/>
     <circle cx="32" cy="36" r="3.5" fill="#e0245e" ${O}/><circle cx="22" cy="38" r="2.2" fill="#46c8ff"/><circle cx="42" cy="38" r="2.2" fill="#46c8ff"/>`,
    grad('ai-g', '#fff3b0', '#d4a73a') + radial('ai-r', '#ffffff', '#ff9a1f')),
  'sylvaran-storm': svg(
    `<circle cx="32" cy="32" r="28" fill="url(#st-r)"/>
     <path d="M32 6 C48 16 48 42 32 58 C16 42 16 16 32 6 Z" fill="url(#st-g)" ${O}/>
     <path d="M32 10 V54" stroke="#0f4028" stroke-width="2"/>
     <g stroke="#e8f8e0" stroke-width="2.2" stroke-linecap="round">
       <path d="M6 10 L20 24 M12 6 L24 18 M44 20 L58 6 M46 26 L60 14 M8 52 L18 42 M56 54 L46 44"/>
     </g>`,
    grad('st-g', '#b6f5c9', '#1f7a4c') + radial('st-r', '#d9f5b0', '#1f7a4c')),
  'ash-fury': svg(
    `<circle cx="32" cy="34" r="28" fill="url(#af-r)"/>
     <path d="M32 60 C14 58 10 40 20 28 C20 36 24 38 26 36 C22 24 30 12 38 4 C38 16 48 20 48 34 C52 30 52 26 50 22 C60 34 54 58 32 60 Z" fill="url(#af-g)" ${O}/>
     <path d="M20 40 L26 34 L30 42 M44 40 L38 34 L34 42" stroke="#1a0a05" stroke-width="3" fill="none"/>
     <path d="M26 50 L30 46 L34 50 L38 46" stroke="#fff3b0" stroke-width="2" fill="none"/>`,
    grad('af-g', '#ffe27a', '#c01f0c') + radial('af-r', '#ff7a1a', '#4f0d0d')),
  'fallen-legion': svg(
    `<circle cx="32" cy="30" r="28" fill="url(#fl-r)"/>
     <path d="M32 6 C16 6 10 18 12 30 C13 38 18 40 20 44 V52 H44 V44 C46 40 51 38 52 30 C54 18 48 6 32 6 Z" fill="url(#fl-g)" ${O}/>
     <ellipse cx="24" cy="30" rx="6" ry="7" fill="#12141a"/><ellipse cx="40" cy="30" rx="6" ry="7" fill="#12141a"/>
     <circle cx="24" cy="31" r="2.4" fill="#5ff5d6"/><circle cx="40" cy="31" r="2.4" fill="#5ff5d6"/>
     <path d="M32 36 L28 44 H36 Z" fill="#12141a"/>
     <path d="M24 52 V58 M29 52 V60 M35 52 V60 M40 52 V58" stroke="#d9d4bf" stroke-width="3"/>`,
    grad('fl-g', '#f2eedc', '#8f8a76') + radial('fl-r', '#5ff5d6', '#24133b')),
  'ancestral-golem': svg(
    `<circle cx="32" cy="32" r="28" fill="url(#ag-r)"/>
     <rect x="14" y="10" width="36" height="44" rx="10" fill="url(#ag-g)" ${O}/>
     <rect x="20" y="22" width="8" height="5" fill="#ffb347"/><rect x="36" y="22" width="8" height="5" fill="#ffb347"/>
     <path d="M22 36 L32 42 L42 36 M32 42 V52 M18 14 L24 20 M46 14 L40 20" stroke="#ffb347" stroke-width="2.4" fill="none"/>
     <ellipse cx="46" cy="46" rx="4" ry="2" fill="#4f7d3a"/>`,
    grad('ag-g', '#bfb4a0', '#3a342c') + radial('ag-r', '#ffb347', '#5e2f09')),
};

export const RACE_EMBLEM: Record<Race, string> = {
  human: svg(`<circle cx="32" cy="32" r="11" fill="#f4d06f" ${O}/><g stroke="#f4d06f" stroke-width="4" stroke-linecap="round"><path d="M32 4 V14 M32 50 V60 M4 32 H14 M50 32 H60 M12 12 L19 19 M45 45 L52 52 M52 12 L45 19 M12 52 L19 45"/></g>`),
  elf: svg(`<path d="M32 4 C52 18 52 44 32 60 C12 44 12 18 32 4 Z" fill="#7dffb5" ${O}/><path d="M32 10 V54 M32 24 L22 18 M32 34 L42 28 M32 44 L22 38" stroke="#0f4028" stroke-width="2.4"/>`),
  orc: svg(`<path d="M12 12 L52 52 M52 12 L12 52" stroke="#ff7a2f" stroke-width="7" stroke-linecap="round"/><path d="M6 10 L20 6 L14 22 Z M58 10 L44 6 L50 22 Z" fill="#e8dcc0" ${O}/>`),
  undead: svg(`<path d="M32 6 C16 6 10 18 12 30 C13 38 18 40 20 44 V54 H44 V44 C46 40 51 38 52 30 C54 18 48 6 32 6 Z" fill="#d9d4bf" ${O}/><circle cx="24" cy="30" r="6" fill="#12141a"/><circle cx="40" cy="30" r="6" fill="#12141a"/><circle cx="24" cy="30" r="2.4" fill="#5ff5d6"/><circle cx="40" cy="30" r="2.4" fill="#5ff5d6"/>`),
  dwarf: svg(`<rect x="10" y="8" width="44" height="18" rx="3" fill="#ffd27a" ${O}/><rect x="28" y="24" width="8" height="34" fill="#8a5a33" ${O}/><path d="M16 14 H48" stroke="#b5621a" stroke-width="3"/>`),
};

/** Icono del nivel de energía (gema) para el coste de las cartas. */
export const ENERGY_ICON = svg(`<path d="M32 4 L54 26 L32 60 L10 26 Z" fill="#46c8ff" ${O}/><path d="M32 4 L42 26 L32 60 L22 26 Z" fill="#b8ecff"/>`);
