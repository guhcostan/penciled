import { afterEach, expect, test, vi } from 'vitest';
import type { Annotation } from '../src/engine/types.ts';
import { annotate } from '../src/headless.ts';
import { cleanup, track } from './helpers.ts';

afterEach(cleanup);

// Budgets are several times what current browsers need, so slow CI machines pass too.
const BUDGET = 400;

const WORDS = `the of and a to in is was he for it with as his on be at by this had not are but
  from or have an they which one you were her all she there would their we him been has when who
  will more no if out so said what up its about into than them can only other new some could time
  these two may then do first any my now such like our over man me even most made after also did
  many before must through back years where much your way well down should because each just those
  people how too little state good very make world still own see men work long get here between
  both life being under never day same another know while last might us great old year off come
  since against go came right used take three`.split(/\s+/);

/** A ~50,000-word article of pseudo-random common words, one text node per paragraph. */
function article(): HTMLElement {
  let seed = 1;
  const rand = (n: number) => {
    seed = (seed * 16807) % 2147483647;
    return seed % n;
  };
  const root = document.createElement('article');
  for (let words = 0; words < 50_000; ) {
    const p = document.createElement('p');
    const length = 60 + rand(80);
    p.textContent = `${Array.from({ length }, () => WORDS[rand(WORDS.length)]).join(' ')}.`;
    root.append(p);
    words += length;
  }
  document.body.append(root);
  return root;
}

/** 500 annotations spread over the article, `length(i)` characters each. */
async function annotated(length: (i: number) => number) {
  const root = article();
  const instance = track(annotate(root, { documentId: 'perf', storage: 'memory' }));
  await instance.ready;
  const paragraphs = root.querySelectorAll('p');
  for (let i = 0; i < 500; i++) {
    const text = paragraphs[i % paragraphs.length]!.firstChild!;
    const range = document.createRange();
    const start = (i * 37) % 200;
    range.setStart(text, start);
    range.setEnd(text, start + length(i));
    instance.create(range, i % 3 ? {} : { note: 'A note' });
  }
  return { root, instance, data: instance.export() };
}

const time = (fn: () => void) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

test('restores 500 annotations in a 50,000-word article quickly', async () => {
  const { root, instance, data } = await annotated((i) => 25 + (i % 40));
  instance.destroy();
  const t = performance.now();
  const restored = track(
    annotate(root, {
      documentId: 'perf',
      storage: { load: async () => data.annotations, save: async () => {} },
    }),
  );
  await restored.ready;
  expect(performance.now() - t).toBeLessThan(BUDGET);
  expect(restored.getAll().every((a) => restored.getRange(a.id))).toBe(true);
});

test('re-anchors 500 short, common quotes quickly after content shifts', async () => {
  // Short quotes like "the" have thousands of exact matches: a full search for each is slow.
  const { root, instance } = await annotated((i) => 3 + (i % 6));
  const before = new Map(instance.getAll().map((a) => [a.id, instance.getRange(a.id)!]));
  const intro = (n: number) =>
    Object.assign(document.createElement('p'), { textContent: 'An inserted intro. '.repeat(n) });

  root.prepend(intro(20));
  expect(time(() => instance.refresh())).toBeLessThan(BUDGET);
  // Edits in the middle shift only what follows them.
  root.children[300]!.after(intro(3));
  expect(time(() => instance.refresh())).toBeLessThan(BUDGET);

  for (const a of instance.getAll()) {
    const now = instance.getRange(a.id)!;
    const was = before.get(a.id)!;
    // Still on the same occurrence: the same text node and offset as before.
    expect([now.startContainer, now.startOffset]).toEqual([was.startContainer, was.startOffset]);
  }
});

test('creating or focusing one annotation only touches the ranges that changed', async () => {
  const { root, instance } = await annotated((i) => 25 + (i % 40));
  const yellow = CSS.highlights.get('penciled-yellow');
  const add = vi.spyOn(Highlight.prototype, 'add');
  const remove = vi.spyOn(Highlight.prototype, 'delete');
  const clear = vi.spyOn(Highlight.prototype, 'clear');
  const [first, , second] = instance.getAll() as [Annotation, Annotation, Annotation];
  instance.focus(first.id);
  instance.focus(second.id);
  const range = document.createRange();
  range.selectNodeContents(root.lastElementChild!.firstChild!);
  instance.create(range, { color: 'green' });
  // Each step changes a range or two (the active one, the new annotation), not all 500.
  expect(add.mock.calls.length).toBeLessThan(10);
  expect(remove.mock.calls.length).toBeLessThan(10);
  expect(clear).not.toHaveBeenCalled();
  // Registries are updated in place, never replaced.
  expect(CSS.highlights.get('penciled-yellow')).toBe(yellow);
  expect(time(() => instance.focus(instance.getAll()[250]!.id))).toBeLessThan(BUDGET / 10);
});

test('indexes a page made of many small text nodes quickly', async () => {
  // Like a large wiki page or a code diff: 60,000 short nodes, each in its own element.
  const root = document.createElement('div');
  for (let i = 0; i < 6000; i++) {
    const p = document.createElement('p');
    for (let j = 0; j < 10; j++) {
      p.append(Object.assign(document.createElement('span'), { textContent: ` word ${j} ` }));
    }
    root.append(p);
  }
  document.body.append(root);
  const instance = track(annotate(root, { documentId: 'nodes', storage: 'memory' }));
  await instance.ready;
  expect(time(() => instance.refresh())).toBeLessThan(BUDGET);
});
