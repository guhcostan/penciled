import type { Worker } from '@playwright/test';
import { expect, painted, send, store, stored, tabId, test } from './fixtures.ts';

const ARTICLE = 'http://localhost:5180/article.html';
const OTHER = 'http://example.com/essay';
const annotation = (id: string, quote: string, extra = {}) => ({
  version: 1,
  id,
  quote,
  prefix: '',
  suffix: '',
  start: 0,
  end: quote.length,
  color: 'c2',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

/** The tags stored for annotation `id` on page `url`. */
async function tagsOf(background: Worker, url: string, id: string) {
  const page = (await stored(background))[`page:${url}`] as {
    annotations: { id: string; meta?: { tags?: string[] } }[];
  };
  return page.annotations.find((a) => a.id === id)?.meta?.tags;
}

test.beforeEach(async ({ background }) => {
  await store(background, 'local', {
    [`page:${ARTICLE}`]: {
      version: 1,
      annotations: [
        annotation('a', 'lazy dog', { note: 'Very lazy.' }),
        annotation('b', 'a sentence that was edited away'),
      ],
    },
    [`meta:${ARTICLE}`]: {
      url: ARTICLE,
      title: 'An article',
      count: 2,
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    [`page:${OTHER}`]: {
      version: 1,
      annotations: [annotation('c', 'Essays are attempts', { color: 'c1', note: 'Montaigne' })],
    },
    [`meta:${OTHER}`]: {
      url: OTHER,
      title: 'On essays',
      count: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  });
});

test('lists this page’s highlights, opens and deletes them, and follows changes', async ({
  context,
  background,
  extension,
}) => {
  const page = await context.newPage();
  await page.goto(ARTICLE);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });

  const sidebar = await context.newPage();
  await sidebar.goto(`${extension}/sidepanel.html?tab=${await tabId(background, page)}`);
  await sidebar.getByRole('tab', { name: 'This page' }).click();
  await expect(sidebar.getByText('localhost · 2 highlights')).toBeVisible();
  const cards = sidebar.getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('lazy dog');
  await expect(cards.first()).toContainText('Very lazy.');
  await expect(cards.last()).toContainText('Couldn’t find this on the page.');

  await cards.first().getByRole('button').first().click();
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-active': ['lazy dog'] });

  await cards.last().hover();
  await cards.last().getByRole('button', { name: 'Delete highlight' }).click();
  await expect(cards).toHaveCount(1);
  await expect
    .poll(() => stored(background))
    .toMatchObject({ [`page:${ARTICLE}`]: { annotations: [{ id: 'a' }] } });

  // Changed elsewhere: the notes page, or another tab.
  await store(background, 'local', {
    [`page:${ARTICLE}`]: {
      version: 1,
      annotations: [
        annotation('a', 'lazy dog', { note: 'Very lazy.' }),
        annotation('d', 'bushy tail', { updatedAt: '2026-01-03T00:00:00.000Z' }),
      ],
    },
  });
  await expect(cards).toHaveCount(2);
  await expect(cards.last()).toContainText('bushy tail');

  // Hidden with the shortcut.
  await send(background, page, { type: 'toggle' });
  await expect(sidebar.getByText('Highlights are hidden on this tab')).toBeVisible();
});

test('searches highlights on every page, and opens them', async ({
  context,
  background,
  extension,
}) => {
  const page = await context.newPage();
  await page.goto(ARTICLE);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });

  const sidebar = await context.newPage();
  await sidebar.goto(`${extension}/sidepanel.html?tab=${await tabId(background, page)}`);
  await sidebar.getByRole('tab', { name: 'All pages' }).click();
  const groups = sidebar.locator('.group');
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toContainText('An article');
  await expect(groups.first()).toContainText('This page');
  await expect(groups.last()).toContainText('On essays');

  await sidebar.getByRole('searchbox').fill('montaigne');
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText('Essays are attempts');
  await sidebar.getByRole('searchbox').fill('nothing like this');
  await expect(sidebar.getByText('Nothing matches “nothing like this”.')).toBeVisible();
  await sidebar.getByRole('searchbox').press('Escape');
  await expect(groups).toHaveCount(2);

  // A highlight on the tab's own page is shown there, rather than in a new tab.
  await groups
    .first()
    .getByRole('button', { name: /lazy dog/ })
    .click();
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-active': ['lazy dog'] });

  // The view is remembered.
  await sidebar.reload();
  await expect(sidebar.getByRole('tab', { name: 'All pages' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('turns penciled back on for a site', async ({ context, background, extension }) => {
  const page = await context.newPage();
  await page.goto(ARTICLE);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });
  await send(background, page, { type: 'site', enabled: false });
  await expect.poll(() => painted(page)).toEqual({});

  const sidebar = await context.newPage();
  await sidebar.goto(`${extension}/sidepanel.html?tab=${await tabId(background, page)}`);
  await sidebar.getByRole('tab', { name: 'This page' }).click();
  await expect(sidebar.getByText('penciled is off on localhost')).toBeVisible();
  await sidebar.getByRole('button', { name: 'Turn on' }).click();
  await expect(sidebar.getByRole('listitem')).toHaveCount(2);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });
});

test('hides and shows highlights on this tab, without turning the site off', async ({
  context,
  background,
  extension,
}) => {
  const page = await context.newPage();
  await page.goto(ARTICLE);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });

  const sidebar = await context.newPage();
  await sidebar.goto(`${extension}/sidepanel.html?tab=${await tabId(background, page)}`);
  await sidebar.getByRole('tab', { name: 'This page' }).click();
  const hide = sidebar.getByRole('button', { name: 'Hide highlights on this tab' });
  await hide.click();
  await expect(sidebar.getByText('Highlights are hidden on this tab')).toBeVisible();
  await expect.poll(() => painted(page)).toEqual({});
  const show = sidebar.getByRole('button', { name: 'Show highlights on this tab' });
  await expect(show).toBeFocused();
  expect((await stored(background))['disabled-sites'] ?? []).toEqual([]);

  await show.click();
  await expect(sidebar.getByRole('listitem')).toHaveCount(2);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });

  // From the hidden state's own button too.
  await hide.click();
  await sidebar.getByRole('button', { name: 'Show highlights', exact: true }).click();
  await expect(sidebar.getByRole('listitem')).toHaveCount(2);
});

test('opens the notes page', async ({ context, extension }) => {
  const sidebar = await context.newPage();
  await sidebar.goto(`${extension}/sidepanel.html?tab=999999`);
  const [notes] = await Promise.all([
    context.waitForEvent('page'),
    sidebar.getByRole('button', { name: 'All notes' }).click(),
  ]);
  await expect(notes).toHaveURL(`${extension}/options.html#notes`);
  await expect(notes.getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
});

test('the toolbar button opens the sidebar, or the popup when the settings say so', async ({
  context,
  background,
  extension,
}) => {
  type Chrome = { chrome: typeof import('wxt/browser').browser };
  const button = () =>
    background.evaluate(async () => {
      const chrome = (globalThis as unknown as Chrome).chrome;
      const [popup, behavior] = await Promise.all([
        chrome.action.getPopup({}),
        chrome.sidePanel.getPanelBehavior(),
      ]);
      return { popup: popup.replace(/^.*\//, ''), sidebar: behavior.openPanelOnActionClick };
    });
  await expect.poll(button).toEqual({ popup: '', sidebar: true });

  const settings = await context.newPage();
  await settings.goto(`${extension}/options.html#settings`);
  await expect(settings.getByRole('radio', { name: 'The sidebar' })).toBeChecked();
  await settings.getByRole('radio', { name: 'This page’s highlights' }).check();
  await expect.poll(button).toEqual({ popup: 'popup.html', sidebar: false });
  await settings.getByRole('radio', { name: 'The sidebar' }).check();
  await expect.poll(button).toEqual({ popup: '', sidebar: true });
});

test('tags highlights on this page, and filters by them', async ({
  context,
  background,
  extension,
}) => {
  const page = await context.newPage();
  await page.goto(ARTICLE);
  await expect.poll(() => painted(page)).toMatchObject({ 'penciled-c2': ['lazy dog'] });

  const sidebar = await context.newPage();
  await sidebar.goto(`${extension}/sidepanel.html?tab=${await tabId(background, page)}`);
  await sidebar.getByRole('tab', { name: 'This page' }).click();
  const cards = sidebar.getByRole('listitem');
  await cards.first().hover();
  await cards.first().getByRole('button', { name: 'Edit tags' }).click();
  const field = sidebar.getByRole('combobox', { name: 'Add a tag' });
  await expect(field).toBeFocused();
  await field.fill('Reading list');
  await field.press('Enter');
  await field.pressSequentially('fox,');
  await expect(cards.first().getByText('#fox')).toBeVisible();
  await expect.poll(() => tagsOf(background, ARTICLE, 'a')).toEqual(['reading-list', 'fox']);

  // Backspace in an empty field removes the last tag; Escape closes it.
  await expect(field).toBeFocused();
  await field.press('Backspace');
  await expect(cards.first().getByText('#fox')).toHaveCount(0);
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(cards.first().getByRole('button', { name: '#reading-list' })).toBeVisible();

  const filter = sidebar.getByRole('group', { name: 'Filter by tag' }).getByRole('button');
  await expect(filter).toHaveText(['#reading-list']);
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(sidebar.getByRole('searchbox')).toHaveValue('#reading-list');
  await expect(cards).toHaveCount(1);
  await filter.click();
  await expect(cards).toHaveCount(2);
});

test('suggests tags in use, and tags highlights on other pages', async ({
  context,
  background,
  extension,
}) => {
  await store(background, 'local', {
    [`page:${ARTICLE}`]: {
      version: 1,
      annotations: [annotation('a', 'lazy dog', { meta: { tags: ['reading-list'] } })],
    },
  });
  const sidebar = await context.newPage();
  // No page of its own: the sidebar's own tab.
  await sidebar.goto(`${extension}/sidepanel.html?tab=999999`);
  await sidebar.getByRole('tab', { name: 'All pages' }).click();
  const essay = sidebar.locator('.group').filter({ hasText: 'On essays' });
  await essay.getByRole('listitem').hover();
  await essay.getByRole('button', { name: 'Edit tags' }).click();
  const field = sidebar.getByRole('combobox', { name: 'Add a tag' });
  await field.fill('read');
  await expect(sidebar.getByRole('option')).toHaveText(['#reading-list']);
  await field.press('ArrowDown');
  await field.press('Enter');
  await field.press('Escape');
  await expect.poll(() => tagsOf(background, OTHER, 'c')).toEqual(['reading-list']);

  await sidebar.getByRole('searchbox').fill('#reading-list');
  await expect(sidebar.locator('.group')).toHaveCount(2);
  await sidebar.getByRole('searchbox').fill('#reading-list montaigne');
  await expect(sidebar.locator('.group')).toHaveCount(1);
});
