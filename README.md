# penciled.js

penciled is a 15 kB open-source JavaScript library for persistent highlights and notes on any web page. Think **Sonner, for text annotations**.

[Documentation](https://penciled.org) · [Playground](https://penciled.org/playground/) · [npm](https://www.npmjs.com/package/penciled) · [Browser extension](https://penciled.org/extension/)

![Selecting a sentence, highlighting it in yellow and adding a note. After a reload the highlight comes back, and hovering it shows the note.](./.github/assets/demo.gif)

```sh
npm install penciled
```

```ts
import { annotate } from 'penciled';
import 'penciled/styles.css';

annotate('#article');
```

Readers can now select text to highlight it, add a note, or click a highlight to change it. Annotations are saved to `localStorage` and come back on reload.

## Features

- **Beautiful by default.** A floating toolbar and note editor that appear only when needed, in light and dark themes.
- **Yours to style.** Theme the UI with CSS custom properties, or restyle anything: default selectors have (almost) zero specificity, so your CSS wins. Need a different UI altogether? Go headless and build your own. See [Theming](https://penciled.org/guides/theming/).
- **Framework-agnostic.** Plain DOM, with an optional React adapter. Highlights are painted with the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API), so your DOM is never modified.
- **Reliable anchoring.** Highlights are re-anchored when the content changes. When penciled can't be sure where a highlight belongs, it leaves it out instead of highlighting the wrong text.
- **Persistent.** Uses `localStorage` out of the box. Plug in your own storage adapter to save to a backend.
- **Accessible.** Keyboard shortcuts for the toolbar and for moving between annotations, with screen-reader announcements.
- **Small.** About 15 kB min+gzip with the UI, 6 kB headless. One dependency (`@floating-ui/dom`).

## Browser extension

Not building a site? [penciled for the browser](https://penciled.org/extension/) lets you highlight and take notes on any website. Install it for [Chrome](https://chromewebstore.google.com/detail/edpobhdkceoadekhpdagmnknocckaaje), [Firefox](https://addons.mozilla.org/en-US/firefox/addon/penciled-highlighter/) or [Edge](https://microsoftedge.microsoft.com/addons/detail/penciled-%E2%80%93-highlighter-/abhbgdlbgleahgeodcifnpecikbdciml). It's built on this library and lives in [`apps/extension`](./apps/extension).

## Saving to your backend

```ts
annotate('#article', {
  documentId: 'post-42',
  storage: {
    load: (documentId) => fetch(`/api/annotations/${documentId}`).then((r) => r.json()),
    save: (documentId, annotations) =>
      fetch(`/api/annotations/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify(annotations),
      }).then(() => {}),
  },
});
```

Adapters can also implement `create`, `update` and `delete` to save one annotation at a time. See [Custom storage](https://penciled.org/recipes/rest-storage/).

## React

```tsx
import { Annotatable } from 'penciled/react';
import 'penciled/styles.css';

export function Article({ children }) {
  return <Annotatable options={{ documentId: 'post-42' }}>{children}</Annotatable>;
}
```

There is also a `useAnnotations(ref, options)` hook. See [React](https://penciled.org/recipes/react/).

## Headless

`penciled/headless` is the engine without the UI. It handles anchoring, painting, persistence and events, and you build the interface with whatever components and styles you already use.

```ts
import { annotate } from 'penciled/headless';

const annotator = annotate('#article');
annotator.on('select', (context) => {
  // Show your own UI for the selected text or annotation.
});
```

## Browser support

Chrome and Edge 105+, Safari 17.2+ and Firefox 140+, on desktop and mobile. With the default styles, the minimums are Chrome and Edge 123+ and Safari 17.5+. In older browsers `annotate()` logs a warning and does nothing. Importing is safe during server-side rendering. See [Browser support](https://penciled.org/guides/browser-support/).

## Development

| Path | What |
|---|---|
| [`packages/penciled`](./packages/penciled) | The library: `penciled`, `penciled/headless`, `penciled/react` and `penciled/styles.css` |
| [`apps/docs`](./apps/docs) | The documentation site and playground (Astro + Starlight) |

```sh
pnpm install
pnpm test
pnpm docs:dev
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## License

[MIT](./LICENSE) © Marcel Losso
