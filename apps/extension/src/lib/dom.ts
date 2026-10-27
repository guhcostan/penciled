type Attrs = Record<string, string | number | boolean | undefined>;

/** Creates an element. Strings become text nodes, so stored text is never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | false | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : `${v}`);
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';

/** A 16px stroked icon, drawn from `shapes`: `['path', { d }]`, `['rect', { … }]` and so on. */
export function icon(...shapes: [string, Record<string, string | number>][]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  const attrs = {
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, `${v}`);
  for (const [tag, shape] of shapes) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(shape)) el.setAttribute(k, `${v}`);
    svg.append(el);
  }
  return svg;
}

/** The icons the extension's pages use. */
export const ICONS = {
  sidebar: () =>
    icon(['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }], ['path', { d: 'M15 3v18' }]),
  settings: () =>
    icon(
      ['path', { d: 'M20 7h-9' }],
      ['path', { d: 'M14 17H5' }],
      ['circle', { cx: 17, cy: 17, r: 3 }],
      ['circle', { cx: 7, cy: 7, r: 3 }],
    ),
  trash: () =>
    icon(
      ['path', { d: 'M3 6h18' }],
      ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
      ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ),
  pencil: () =>
    icon([
      'path',
      {
        d: 'M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z',
      },
    ]),
  tag: () =>
    icon(
      [
        'path',
        {
          d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
        },
      ],
      ['circle', { cx: 7.5, cy: 7.5, r: 0.5, fill: 'currentColor' }],
    ),
  x: () => icon(['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]),
  search: () => icon(['circle', { cx: 11, cy: 11, r: 8 }], ['path', { d: 'm21 21-4.3-4.3' }]),
  notes: () =>
    icon(
      ['rect', { width: 16, height: 20, x: 4, y: 2, rx: 2 }],
      ['path', { d: 'M2 6h4M2 10h4M2 14h4M2 18h4' }],
      ['path', { d: 'M9.5 8h5M9.5 12H16M9.5 16H14' }],
    ),
  eye: () =>
    icon(
      [
        'path',
        {
          d: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0',
        },
      ],
      ['circle', { cx: 12, cy: 12, r: 3 }],
    ),
  eyeOff: () =>
    icon(
      [
        'path',
        { d: 'M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49' },
      ],
      ['path', { d: 'M14.08 14.16a3 3 0 0 1-4.24-4.24' }],
      [
        'path',
        {
          d: 'M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14',
        },
      ],
      ['path', { d: 'm2 2 20 20' }],
    ),
};
