import { afterEach, describe, expect, test } from 'vitest';
import { anchor, describeRange, selectorAt } from '../src/engine/anchoring/selector.ts';
import { buildIndex } from '../src/engine/anchoring/text.ts';
import { cleanup, mount } from './helpers.ts';

afterEach(cleanup);

interface Fixture {
  name: string;
  /** Original content, with the annotated range marked `[[ … ]]`. */
  before: string;
  /** Changed content, with the expected match marked `[[ … ]]`, or no markers to expect an orphan. */
  after: string;
}

const lorem =
  'Annotation engines need to survive edits. Readers highlight text, writers keep editing, and the two must not drift apart.';

const fixtures: Fixture[] = [
  // Unchanged content and selection shapes
  {
    name: 'unchanged, single text node',
    before: `<p>Some intro.</p><p>The [[quick brown fox]] jumps.</p>`,
    after: `<p>Some intro.</p><p>The [[quick brown fox]] jumps.</p>`,
  },
  {
    name: 'selection spanning inline markup',
    before: `<p>The qu[[ick <b>brown</b> <i>f]]ox</i> jumps.</p>`,
    after: `<p>The qu[[ick <b>brown</b> <i>f]]ox</i> jumps.</p>`,
  },
  {
    name: 'selection spanning paragraphs',
    before: `<p>First para[[graph ends here.</p>\n<p>Second paragraph</p>\n<p>Third]] one.</p>`,
    after: `<p>First para[[graph ends here.</p>\n<p>Second paragraph</p>\n<p>Third]] one.</p>`,
  },
  {
    name: 'quote at the very start',
    before: `<p>[[Opening words]] of the text.</p>`,
    after: `<p>[[Opening words]] of the text.</p>`,
  },
  {
    name: 'quote at the very end',
    before: `<p>The text closes with [[final words]]</p>`,
    after: `<p>The text closes with [[final words]]</p>`,
  },
  {
    name: 'quote is the whole container',
    before: `<p>[[Everything]]</p>`,
    after: `<p>[[Everything]]</p>`,
  },
  {
    name: 'emoji before the quote',
    before: `<p>🎉🎉 Party time: [[bring snacks]] and 🍕.</p>`,
    after: `<p>🎉🎉🎉 Party time: [[bring snacks]] and 🍕.</p>`,
  },

  // Edits outside the quote
  {
    name: 'paragraph inserted before',
    before: `<p>${lorem}</p><p>Keep [[this sentence]] safe.</p>`,
    after: `<p>A brand new opening paragraph.</p><p>${lorem}</p><p>Keep [[this sentence]] safe.</p>`,
  },
  {
    name: 'text appended after',
    before: `<p>${lorem}</p><p>Keep [[this sentence]] safe.</p>`,
    after: `<p>${lorem}</p><p>Keep [[this sentence]] safe.</p><p>Appendix.</p>`,
  },
  {
    name: 'words inserted right before the quote',
    before: `<p>${lorem} Then the [[reader closes the tab]] and leaves.</p>`,
    after: `<p>${lorem} Then, much later, the [[reader closes the tab]] and leaves.</p>`,
  },
  {
    name: 'context edited on both sides',
    before: `<p>${lorem} We think [[anchoring is the hard part]] of this project.</p>`,
    after: `<p>${lorem} We all believe [[anchoring is the hard part]] of the whole project.</p>`,
  },
  {
    name: 'paragraphs reordered',
    before: `<p>Alpha paragraph talks about apples.</p><p>Beta paragraph mentions [[bananas and cherries]].</p><p>Gamma is last.</p>`,
    after: `<p>Gamma is last.</p><p>Beta paragraph mentions [[bananas and cherries]].</p><p>Alpha paragraph talks about apples.</p>`,
  },
  {
    name: 'long unique quote whose surroundings were rewritten',
    before: `<p>Old intro.</p><p>Before. [[The anchoring engine stores a quote with its prefix and suffix context]]. After.</p>`,
    after: `<p>Completely different intro text here.</p><p>Rewritten lead-in: [[The anchoring engine stores a quote with its prefix and suffix context]]; new ending.</p>`,
  },

  // Whitespace and markup changes
  {
    name: 'HTML re-indented',
    before: `<p>Keep the [[indented words]] here.</p>`,
    after: `\n  <p>\n    Keep the\n    [[indented words]]\n    here.\n  </p>\n`,
  },
  {
    name: 'words wrapped in new markup',
    before: `<p>A plain [[sentence with words]] inside.</p>`,
    after: `<p>A <em>plain</em> [[<strong>sentence</strong> with <a href="#">words</a>]] inside.</p>`,
  },
  {
    name: 'markup removed',
    before: `<p>A <em>plain</em> [[<strong>sentence</strong> with <a href="#">words</a>]] inside.</p>`,
    after: `<p>A plain [[sentence with words]] inside.</p>`,
  },
  {
    name: 'space replaced by nbsp',
    before: `<p>Prices start at [[ten dollars]] today.</p>`,
    after: `<p>Prices start at [[ten&nbsp;dollars]] today.</p>`,
  },
  {
    name: 'script added inside the container',
    before: `<p>Track [[this phrase]] please.</p>`,
    after: `<script>window.tracking = "this phrase";</script><p>Track [[this phrase]] please.</p>`,
  },

  // Duplicates
  {
    name: 'second of three duplicates, unchanged',
    before: `<p>The cat sat on the mat.</p><p>Then the dog came.</p><p>The cat sat on the [[mat]] again.</p><p>Finally the cat sat on the mat once more.</p>`,
    after: `<p>The cat sat on the mat.</p><p>Then the dog came.</p><p>The cat sat on the [[mat]] again.</p><p>Finally the cat sat on the mat once more.</p>`,
  },
  {
    name: 'duplicate chosen by context after an insertion shifts positions',
    before: `<p>The cat sat on the mat.</p><p>Then the dog came.</p><p>The cat sat on the [[mat]] again.</p><p>Finally the cat sat on the mat once more.</p>`,
    after: `<p>Prologue added later on.</p><p>The cat sat on the mat.</p><p>Then the dog came.</p><p>The cat sat on the [[mat]] again.</p><p>Finally the cat sat on the mat once more.</p>`,
  },
  {
    name: 'stored position now holds a different duplicate',
    before: `<p>Intro: the [[API]] is small.</p><p>Elsewhere the API is big.</p>`,
    // "Elsewhere: " is 11 characters, like "Intro: the ", so the stored offsets hit this "API".
    after: `<p>Elsewhere: API is big.</p>`,
  },
  {
    name: 'annotated duplicate deleted, others remain',
    before: `<p>Use the [[API]] wisely.</p><p>Read the API docs.</p><p>The API is versioned.</p>`,
    after: `<p>Read the API docs.</p><p>The API is versioned.</p>`,
  },
  {
    name: 'identical repeated context is ambiguous after an edit',
    before: `<p>${'na '.repeat(20)}[[na]]${' na'.repeat(20)}</p>`,
    after: `<p>Batman! ${'na '.repeat(20)}na${' na'.repeat(20)}</p>`,
  },

  // Edits inside the quote
  {
    name: 'typo fixed inside the quote',
    before: `<p>${lorem} It is [[teh best approach we know]] for now.</p>`,
    after: `<p>${lorem} It is [[the best approach we know]] for now.</p>`,
  },
  {
    name: 'word changed inside the quote',
    before: `<p>${lorem} Remember that [[highlights should persist across reloads]] always.</p>`,
    after: `<p>${lorem} Remember that [[highlights must persist across reloads]] always.</p>`,
  },
  {
    name: 'word inserted inside the quote, paragraph moved',
    before: `<p>${lorem}</p><p>Users [[expect notes to come back]] tomorrow.</p>`,
    after: `<p>Users [[expect their notes to come back]] tomorrow.</p><p>${lorem}</p>`,
  },
  {
    name: 'long quote with a small edit',
    before: `<p>Intro.</p><p>[[${lorem} ${lorem}]]</p><p>Outro.</p>`,
    after: `<p>Intro.</p><p>[[${lorem} ${lorem.replace('survive', 'outlive')}]]</p><p>Outro.</p>`,
  },
  {
    name: 'quote rewritten beyond recognition',
    before: `<p>${lorem} The [[committee approved the budget]] yesterday.</p>`,
    after: `<p>${lorem} The board rejected every proposal yesterday.</p>`,
  },
  {
    name: 'quote deleted',
    before: `<p>${lorem} Then [[this sentence disappears]] from the page.</p>`,
    after: `<p>${lorem} Then from the page.</p>`,
  },
  {
    name: 'first word of the quote replaced',
    before: `<p>${lorem} Keep [[local notes in the browser]] by default.</p>`,
    after: `<p>${lorem} Keep [[private notes in the browser]] by default.</p>`,
  },
  {
    name: 'last word of the quote replaced',
    before: `<p>${lorem} Keep [[local notes in the browser]] by default.</p>`,
    after: `<p>${lorem} Keep [[local notes in the tab]] by default.</p>`,
  },
  {
    name: 'short repeated quote after content is inserted before it',
    before: `<p>${lorem}</p><p>One of the two, and [[the]] other of the three.</p>`,
    after: `<p>A new intro.</p><p>${lorem}</p><p>One of the two, and [[the]] other of the three.</p>`,
  },
  {
    name: 'right-to-left text',
    before: `<p dir="rtl">שלום עולם, [[זהו טקסט]] לדוגמה בעברית.</p>`,
    after: `<p>הקדמה.</p><p dir="rtl">שלום עולם, [[זהו טקסט]] לדוגמה בעברית.</p>`,
  },
  {
    name: 'fuzzy duplicate resolved by context',
    before: `<p>Chapter one: [[the colour of the sky]] was grey.</p><p>Chapter two: the colour of the sea was blue.</p>`,
    after: `<p>Chapter two: the color of the sea was blue.</p><p>Chapter one: [[the color of the sky]] was grey.</p>`,
  },
  {
    name: 'short quote edited while a lookalike exists elsewhere',
    before: `<p>She said [[yes]] at once.</p><p>Later, yet another question.</p>`,
    after: `<p>She said no at once.</p><p>Later, yet another question.</p>`,
  },
];

function offsetsOf(root: HTMLElement, range: Range): [number, number] {
  const index = buildIndex(root);
  let s = index.offset(range.startContainer, range.startOffset);
  let e = index.offset(range.endContainer, range.endOffset);
  while (index.text[s] === ' ') s++;
  while (e > s && index.text[e - 1] === ' ') e--;
  return [s, e];
}

describe('anchoring fixtures', () => {
  for (const f of fixtures) {
    test(f.name, () => {
      const before = mount(f.before);
      const selector = describeRange(buildIndex(before.root), before.range!);
      expect(selector).toBeDefined();

      const after = mount(f.after);
      const result = anchor(buildIndex(after.root).text, selector!);
      if (after.range) {
        expect(result).toEqual(offsetsOf(after.root, after.range));
      } else {
        expect(result).toBeNull();
      }
    });
  }
});

describe('performance', () => {
  // ~150 kB of varied pseudo-random prose: far longer than a typical article.
  const words = `${lorem} margin quiet river lantern copper orbit velvet thunder meadow signal
    harbor ember canvas glacier hollow pepper saddle timber violet whisper anchor beacon`.split(
    /\s+/,
  );
  let seed = 7;
  const rand = (n: number) => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const paragraphs = Array.from({ length: 1000 }, (_, i) =>
    Array.from({ length: 24 }, () => words[rand(words.length)])
      .join(' ')
      .replace(/^/, `${i}. `),
  );
  const text = paragraphs.join(' ');

  /**
   * The fastest of three runs, in ms. A single run on a shared CI machine can catch a garbage
   * collection or a cold JIT, while a real regression is slow every time.
   */
  const fastest = (fn: () => void) =>
    Math.min(
      ...Array.from({ length: 3 }, () => {
        const t = performance.now();
        fn();
        return performance.now() - t;
      }),
    );

  /**
   * Budget for one anchor() call on the text above, in ms. Shared CI runners (WebKit especially)
   * have been seen just over 200 ms, while a real regression, such as an accidental quadratic,
   * is many times slower.
   */
  const budget = 300;

  test('fuzzy-matches a short edited quote quickly', () => {
    const at = text.indexOf('500. ');
    const selector = selectorAt(text, at + 5, at + 40);
    const quote = selector.quote;
    const edited = text.replace(quote, `${quote.slice(0, 10)}xx${quote.slice(12)}`);
    expect(anchor(edited, selector)).toEqual([at + 5, at + 40]);
    expect(fastest(() => anchor(edited, selector))).toBeLessThan(budget);
  });

  test('fuzzy-matches a long edited quote quickly', () => {
    const quote = paragraphs.slice(400, 405).join(' ');
    const start = text.indexOf(quote);
    const selector = selectorAt(text, start, start + quote.length);
    const edited = text.replace('402. ', '402. inserted ');
    expect(anchor(edited, selector)).toEqual([start, start + quote.length + 9]);
    expect(fastest(() => anchor(edited, selector))).toBeLessThan(budget);
  });

  test('orphans quickly when nothing matches', () => {
    const selector = selectorAt('zzz qqq xyzzy plugh frobnicate', 4, 30);
    expect(anchor(text, selector)).toBeNull();
    expect(fastest(() => anchor(text, selector))).toBeLessThan(budget);
  });
});

describe('describeRange', () => {
  test('captures quote, ~32 characters of context and offsets', () => {
    const { root, range } = mount(
      `<p>${lorem} The [[quick brown fox]] jumps over the lazy dog.</p>`,
    );
    const sel = describeRange(buildIndex(root), range!)!;
    expect(sel.quote).toBe('quick brown fox');
    expect(sel.prefix).toBe(`${lorem} The `.slice(-32));
    expect(sel.suffix).toBe(' jumps over the lazy dog.');
    expect(sel.end - sel.start).toBe(sel.quote.length);
  });

  test('trims whitespace at the edges of the selection', () => {
    const { root, range } = mount('<p>one[[  two three\n ]]four</p>');
    expect(describeRange(buildIndex(root), range!)?.quote).toBe('two three');
  });

  test('normalizes whitespace inside the quote', () => {
    const { root, range } = mount('<p>[[two\n   three]]</p>');
    expect(describeRange(buildIndex(root), range!)?.quote).toBe('two three');
  });

  test('returns undefined for empty or whitespace-only ranges', () => {
    const { root, range } = mount('<p>one[[   ]]two</p>');
    expect(describeRange(buildIndex(root), range!)).toBeUndefined();
  });

  test('clamps ranges that extend outside the container', () => {
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.append(outside);
    const { root } = mount('<p>inside text</p>');
    const range = document.createRange();
    range.setStart(outside.firstChild!, 0);
    range.setEnd(root.querySelector('p')!.firstChild!, 6);
    expect(describeRange(buildIndex(root), range)?.quote).toBe('inside');
  });
});
