import { beforeEach, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULTS,
  getSettings,
  nextColorId,
  onSettings,
  saveSettings,
} from '../src/lib/settings.ts';
import { disabledSites, setSiteEnabled, siteOf } from '../src/lib/sites.ts';

beforeEach(() => fakeBrowser.reset());

test('settings start from the defaults and keep what was saved', async () => {
  expect(await getSettings()).toEqual(DEFAULTS);
  await saveSettings({ theme: 'dark' });
  await saveSettings({ openOnSelect: false });
  expect(await getSettings()).toEqual({ ...DEFAULTS, theme: 'dark', openOnSelect: false });
});

test('the toolbar button opens the sidebar, unless the reader saved the popup', async () => {
  expect((await getSettings()).buttonOpens).toBe('sidebar');
  await fakeBrowser.storage.sync.set({ settings: { buttonOpens: 'popup' } });
  expect((await getSettings()).buttonOpens).toBe('popup');
});

test('changes are reported with what they replaced', async () => {
  const fn = vi.fn();
  onSettings(fn);
  await saveSettings({ theme: 'light' });
  expect(fn).toHaveBeenCalledWith(
    expect.objectContaining({ theme: 'light' }),
    expect.objectContaining({ theme: 'auto' }),
  );
});

test('new colors never reuse an id, retired ones included', () => {
  expect(nextColorId(DEFAULTS.colors)).toBe('c6');
  expect(nextColorId([{ id: 'c2', label: 'A', value: '#000000', hidden: true }])).toBe('c3');
  expect(nextColorId([])).toBe('c1');
});

test('sites are turned off and on by host, without www.', async () => {
  expect(siteOf('https://www.example.com/a?b#c')).toBe('example.com');
  expect(siteOf('file:///Users/me/notes.html')).toBe('file');
  await setSiteEnabled('example.com', false);
  await setSiteEnabled('news.example.org', false);
  await setSiteEnabled('example.com', false);
  expect(await disabledSites()).toEqual(['example.com', 'news.example.org']);
  await setSiteEnabled('example.com', true);
  expect(await disabledSites()).toEqual(['news.example.org']);
});
