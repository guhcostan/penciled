import '../../assets/ui.css';
import { browser } from 'wxt/browser';
import { h, ICONS } from '../../lib/dom.ts';
import { ask, type PageState } from '../../lib/messages.ts';
import {
  deleteAnnotation,
  listPages,
  openAnnotation,
  type Page,
  setTags,
} from '../../lib/pages.ts';
import { highlight } from '../../lib/scheme.ts';
import { formatQuery, matchesQuery, parseQuery, search } from '../../lib/search.ts';
import { getSettings, onSettings, type PaletteColor } from '../../lib/settings.ts';
import { PORT } from '../../lib/sidebar.ts';
import { siteOf } from '../../lib/sites.ts';
import { countTags, tagsOf } from '../../lib/tags.ts';
import { tagEditor } from './tags.ts';

type View = 'page' | 'all';

/** A highlight as a card shows it, from the page's tab or from storage. */
interface Card {
  id: string;
  quote: string;
  note?: string;
  color: string;
  tags: string[];
  orphan?: boolean;
  open: () => unknown;
  remove: () => Promise<unknown>;
  setTags: (tags: string[]) => Promise<unknown>;
}

const app = document.getElementById('app')!;
const dark = matchMedia('(prefers-color-scheme: dark)');
const still = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
// Tests open the sidebar in a tab, naming the page's tab with `?tab=`.
const named = Number(new URLSearchParams(location.search).get('tab')) || undefined;

// Remembered, so the sidebar opens on the view it was left on.
let view: View = localStorage.getItem('view') === 'all' ? 'all' : 'page';
let query = '';
let tab: number | undefined;
let colors: PaletteColor[] = [];
let toggleKeys = '';
// Every tag in use, most used first.
let known: string[] = [];
// The highlight whose tags are being edited, and what's typed there.
let editing: string | undefined;
let draft = '';
// Where focus goes after the next render, by highlight id and the control's class.
let refocus: { id: string; control: string } | undefined;
// The tags in the current view, to filter by.
let scope: string[] = [];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Header

const tabButton = (value: View, label: string) => {
  const button = h('button', { type: 'button', role: 'tab', id: `tab-${value}` }, label);
  button.onclick = () => show(value);
  return button;
};
const tabs = { page: tabButton('page', 'This page'), all: tabButton('all', 'All pages') };
const tablist = h('div', { class: 'segmented', role: 'tablist' }, tabs.page, tabs.all);
tablist.onkeydown = (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  show(view === 'page' ? 'all' : 'page');
  tabs[view].focus();
};

/** Opens a tab of the extension page, `notes` or `settings`. */
const openPage = (page: string) =>
  browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}#${page}` });

const notes = h(
  'button',
  { type: 'button', class: 'icon', 'aria-label': 'All notes', title: 'All notes' },
  ICONS.notes(),
);
notes.onclick = () => openPage('notes');
const settings = h(
  'button',
  { type: 'button', class: 'icon', 'aria-label': 'Settings', title: 'Settings' },
  ICONS.settings(),
);
settings.onclick = () => openPage('settings');

const input = h('input', {
  type: 'search',
  placeholder: 'Search',
  'aria-label': 'Search highlights and notes',
});
const setQuery = (next: string) => {
  input.value = query = next;
  render();
};
input.oninput = () => setQuery(input.value);

/** Filters by `tag`, or stops filtering by it. */
const toggleFilter = (tag: string) => {
  const q = parseQuery(query);
  const tags = q.tags.includes(tag) ? q.tags.filter((t) => t !== tag) : [...q.tags, tag];
  setQuery(formatQuery({ ...q, tags }));
};
input.onkeydown = (e) => {
  if (e.key === 'Escape' && input.value) {
    e.stopPropagation();
    setQuery('');
  }
};

const filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by tag' });

/** The tag filters for `tags`, the ones in the current view, and any already chosen. */
function showFilters(tags: string[]) {
  const chosen = parseQuery(query).tags;
  const all = [...chosen, ...tags.filter((t) => !chosen.includes(t))];
  filters.hidden = !all.length;
  filters.replaceChildren(
    ...all.map((tag) => {
      const chip = h(
        'button',
        { type: 'button', class: 'chip', 'aria-pressed': `${chosen.includes(tag)}` },
        `#${tag}`,
      );
      chip.onclick = () => toggleFilter(tag);
      return chip;
    }),
  );
}

const list = h('div', { class: 'list', role: 'tabpanel' });
const top = h(
  'div',
  { class: 'top' },
  h('div', { class: 'bar' }, tablist, notes, settings),
  h('label', { class: 'search' }, ICONS.search(), input),
  filters,
);
app.replaceChildren(top, list);

// Shows a hairline under the header once the list scrolls beneath it.
const sentinel = h('div', { 'aria-hidden': 'true' });
document.body.prepend(sentinel);
new IntersectionObserver(([entry]) => {
  document.body.toggleAttribute('data-scrolled', !entry!.isIntersecting);
}).observe(sentinel);

addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
});

// Views

function show(next: View) {
  if (next === view) return;
  view = next;
  localStorage.setItem('view', view);
  render(true);
}

/** An empty or explanatory state, centred in the list. */
function blank(title: string, text?: string, ...actions: Node[]) {
  return h(
    'div',
    { class: 'blank' },
    h('p', { class: 'blank-title' }, title),
    text && h('p', { class: 'hint' }, text),
    ...actions,
  );
}

const noMatch = () => blank('No matches', `Nothing matches “${query.trim()}”.`);

/** Collapses `el` out of the list, before what it shows is deleted. */
function collapse(el: HTMLElement): Promise<unknown> {
  if (still.matches) return Promise.resolve();
  const height = `${el.offsetHeight}px`;
  el.style.overflow = 'hidden';
  return el.animate(
    [
      { height, opacity: 1 },
      { height: '0px', opacity: 0 },
    ],
    { duration: 180, easing: EASE, fill: 'forwards' },
  ).finished;
}

function card(c: Card): HTMLLIElement {
  const mark = h('span', { class: 'mark' }, c.quote);
  const value = colors.find((p) => p.id === c.color)?.value;
  if (value && !c.orphan) mark.style.backgroundColor = highlight(value, dark.matches);
  const content = [
    h('span', { class: 'quote' }, mark),
    // The reader's own words, set apart from the page's.
    c.note && h('span', { class: 'note' }, ICONS.pencil(), h('span', {}, c.note)),
    c.orphan && h('span', { class: 'hint' }, 'Couldn’t find this on the page.'),
  ];
  // A highlight that can't be found has nowhere to go.
  const body = c.orphan
    ? h('div', { class: 'open' }, ...content)
    : h('button', { type: 'button', class: 'open' }, ...content);
  if (!c.orphan) body.onclick = () => c.open();

  const tagging = editing === c.id;
  const changeTags = async (tags: string[]) => {
    await c.setTags(tags);
    render();
  };
  const tags = tagging
    ? h(
        'div',
        { class: 'tags' },
        tagEditor({
          tags: c.tags,
          known,
          draft,
          onDraft: (d) => {
            draft = d;
          },
          onChange: changeTags,
          onClose: () => {
            editing = undefined;
            draft = '';
            refocus = { id: c.id, control: 'tag' };
            render();
          },
        }),
      )
    : c.tags.length > 0 &&
      h(
        'div',
        { class: 'tags' },
        ...c.tags.map((tag) => {
          const chip = h(
            'button',
            { type: 'button', class: 'chip', title: `Show only #${tag}` },
            `#${tag}`,
          );
          chip.onclick = () => toggleFilter(tag);
          return chip;
        }),
      );

  const tag = h(
    'button',
    { type: 'button', class: 'tag', 'aria-label': 'Edit tags', title: 'Tags' },
    ICONS.tag(),
  );
  tag.onclick = () => {
    editing = tagging ? undefined : c.id;
    draft = '';
    refocus = editing ? undefined : { id: c.id, control: 'tag' };
    render();
  };
  const remove = h(
    'button',
    { type: 'button', class: 'remove', 'aria-label': 'Delete highlight', title: 'Delete' },
    ICONS.trash(),
  );
  const li = h(
    'li',
    { class: c.orphan ? 'card orphan' : 'card', 'data-id': c.id, 'data-editing': tagging },
    body,
    tags,
    h('div', { class: 'card-actions' }, tag, remove),
  );
  remove.onclick = async () => {
    await collapse(li);
    await c.remove();
    render();
  };
  return li;
}

async function pageView(): Promise<Node[]> {
  let state: PageState | undefined;
  try {
    if (tab) state = await ask(tab, { type: 'state' });
  } catch {}
  if (!tab || !state) {
    // The browser's own pages, the extension store, or a tab opened before penciled was installed.
    return [
      blank(
        'penciled can’t run on this page',
        'If it was open before penciled was installed, reload it.',
      ),
    ];
  }
  const id = tab;
  // Hides or shows highlights on this tab only, as the shortcut does.
  const toggle = async () => {
    await ask(id, { type: 'toggle' });
    render();
  };
  const action = state.hidden ? 'Show' : 'Hide';
  const eye =
    !state.disabled &&
    h(
      'button',
      {
        type: 'button',
        class: 'icon eye',
        'aria-label': `${action} highlights on this tab`,
        title: `${action} highlights (${toggleKeys})`,
      },
      state.hidden ? ICONS.eyeOff() : ICONS.eye(),
    );
  if (eye) eye.onclick = toggle;
  const head = h(
    'header',
    { class: 'page-head' },
    h('p', { class: 'title' }, state.title || state.site),
    h(
      'p',
      { class: 'meta' },
      // Hidden or off, the page reports no highlights, though they're kept.
      state.disabled || state.hidden
        ? state.site
        : `${state.site} · ${plural(state.items.length, 'highlight')}`,
    ),
    eye,
  );

  if (state.disabled) {
    const on = h('button', { type: 'button' }, 'Turn on');
    on.onclick = async () => {
      await ask(id, { type: 'site', enabled: true });
      render();
    };
    return [head, blank(`penciled is off on ${state.site}`, 'Your highlights are kept.', on)];
  }
  if (state.hidden) {
    const show = h('button', { type: 'button' }, 'Show highlights');
    show.onclick = toggle;
    return [
      head,
      blank('Highlights are hidden on this tab', `Press ${toggleKeys} to show them.`, show),
    ];
  }
  if (!state.items.length) {
    return [head, blank('Nothing highlighted yet', 'Select text on the page to highlight it.')];
  }

  scope = countTags(state.items.map((a) => a.tags));
  const q = parseQuery(query);
  const items = state.items.filter((a) => matchesQuery([a.quote, a.note ?? ''], a.tags, q));
  if (!items.length) return [head, noMatch()];
  return [
    head,
    h(
      'ul',
      { class: 'cards' },
      ...items.map((a) =>
        card({
          ...a,
          open: () => ask(id, { type: 'focus', id: a.id }),
          remove: () => ask(id, { type: 'remove', id: a.id }),
          setTags: (tags) => ask(id, { type: 'tags', id: a.id, tags }),
        }),
      ),
    ),
  ];
}

async function allView(pages: Page[]): Promise<Node[]> {
  // To tell which page is this tab's, and focus its highlights there instead of reopening it.
  const current = tab
    ? await ask(tab, { type: 'state' }).then(
        (s) => s.page,
        () => undefined,
      )
    : undefined;
  scope = known;
  if (!pages.length) {
    return [blank('No highlights yet', 'Select text on any page to highlight it.')];
  }
  const shown = search(pages, query);
  if (!shown.length) return [noMatch()];

  const group = (page: Page) => {
    const here = page.id === current ? tab : undefined;
    const title = h(
      'a',
      { class: 'title', href: page.url, target: '_blank', rel: 'noreferrer' },
      page.title || page.url,
    );
    return h(
      'section',
      { class: 'group' },
      h(
        'header',
        { class: 'group-head' },
        title,
        h(
          'p',
          { class: 'meta' },
          `${siteOf(page.url)} · ${plural(page.annotations.length, 'highlight')}`,
          here !== undefined && h('span', { class: 'badge' }, 'This page'),
        ),
      ),
      h(
        'ul',
        { class: 'cards' },
        ...page.annotations.map((a) =>
          card({
            ...a,
            tags: tagsOf(a),
            setTags: (tags) =>
              here !== undefined
                ? ask(here, { type: 'tags', id: a.id, tags })
                : setTags(page, a.id, tags),
            open: () =>
              here !== undefined
                ? ask(here, { type: 'focus', id: a.id })
                : openAnnotation(page, a.id),
            remove: () => deleteAnnotation(page, a.id),
          }),
        ),
      ),
    );
  };
  return shown.map(group);
}

// Rendering

let renders = 0;
let entering = false;

/** Renders the current view. `enter` fades it in, for switching views rather than updating one. */
async function render(enter = false) {
  entering ||= enter;
  const token = ++renders;
  document.body.dataset.view = view;
  for (const [value, button] of Object.entries(tabs)) {
    button.setAttribute('aria-selected', `${value === view}`);
    button.tabIndex = value === view ? 0 : -1;
  }
  list.setAttribute('aria-labelledby', `tab-${view}`);

  const pages = await listPages();
  known = countTags(pages.flatMap((p) => p.annotations.map(tagsOf)));
  scope = [];
  const content = await (view === 'page' ? pageView() : allView(pages));
  // A newer render started while this one loaded.
  if (token !== renders) return;
  // Kept on the eye, which every render replaces, so it can be pressed again.
  const onEye = document.activeElement?.classList.contains('eye');
  list.replaceChildren(...content);
  showFilters(scope);
  // Updates rebuild the list: focus goes back to where it was.
  if (editing) list.querySelector<HTMLInputElement>('[data-editing] input')?.focus();
  else if (onEye) list.querySelector<HTMLElement>('.page-head .eye')?.focus();
  else if (refocus) {
    const { id, control } = refocus;
    refocus = undefined;
    list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .${control}`)?.focus();
  }
  if (entering && !still.matches) {
    list.animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: EASE },
    );
  }
  entering = false;
}

// Changes come in bursts (a save writes the page and its summary), so they render once.
let pending = 0;
const update = () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => render());
};

// Following the tab

const activeTab = async (windowId: number) =>
  (await browser.tabs.query({ active: true, windowId }))[0]?.id;

/** Switches to the tab now active in window `windowId`. */
async function follow(windowId: number) {
  const active = await activeTab(windowId);
  if (active === tab) return;
  tab = active;
  // A different page: start from the top.
  if (view === 'page') scrollTo(0, 0);
  render(view === 'page');
}

/** Connects to the background, which closes the sidebar from the shortcut through it. */
function connect(windowId: number) {
  try {
    const port = browser.runtime.connect({ name: `${PORT}:${windowId}` });
    port.onMessage.addListener((message) => message === 'close' && window.close());
    // The background stopped, and lost track of this sidebar.
    port.onDisconnect.addListener(() => setTimeout(() => connect(windowId), 100));
  } catch {
    // The extension was updated or removed.
  }
}

async function main() {
  const [{ colors: palette }, commands] = await Promise.all([
    getSettings(),
    browser.commands.getAll(),
  ]);
  colors = palette;
  toggleKeys = commands.find((c) => c.name === 'toggle')?.shortcut || 'the shortcut';

  if (named) {
    tab = named;
  } else {
    const windowId = (await browser.windows.getCurrent()).id!;
    tab = await activeTab(windowId);
    connect(windowId);
    browser.tabs.onActivated.addListener((info) => {
      if (info.windowId === windowId) follow(windowId);
    });
    browser.tabs.onUpdated.addListener((id, change) => {
      if (id === tab && change.status === 'complete') update();
    });
  }
  render(true);

  // A single-page app moved to another page, or the shortcut hid or showed the highlights.
  browser.runtime.onMessage.addListener((message: { type?: string }, sender) => {
    if (message.type === 'changed' && sender.tab?.id === tab) update();
  });
  // Highlights changed here, in a tab or on the notes page; or a site was turned on or off.
  browser.storage.local.onChanged.addListener((changes) => {
    if (Object.keys(changes).some((k) => k.startsWith('page:') || k === 'disabled-sites')) update();
  });
  onSettings((next) => {
    colors = next.colors;
    update();
  });
  dark.addEventListener('change', update);
}

main();
