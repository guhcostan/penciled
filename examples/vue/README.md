# penciled: Vue 3 example

The same three lines as the vanilla example, wired into a Vue 3 component.
[Open it on StackBlitz](https://stackblitz.com/github/marcellosso/penciled/tree/main/examples/vue?file=src/App.vue), or run it locally:

```sh
npm install
npm run dev
```

It installs `penciled` from npm, not from this repository.

## What the example shows

`annotate()` takes an element or a selector, so a template ref is enough. The
element only has to exist when the call runs, which means `onMounted`:

```js
const article = ref(null);
let instance = null;

onMounted(async () => {
  instance = annotate(article.value, { documentId: 'vue-example' });
  await instance.ready; // stored annotations are read asynchronously
  count.value = instance.getAll().length;
});

onUnmounted(() => instance?.destroy());
```

Two details are worth copying:

- **`destroy()` in `onUnmounted`.** Annotations persist in storage, but the
  listeners, the selection toolbar and the CSS Custom Highlight registrations
  belong to the instance. Skipping the cleanup stacks a second copy on the page
  after a hot reload or a route change.
- **The instance stays a plain variable.** It holds DOM listeners and highlight
  registrations, not display state, so `ref()` would only make Vue track
  something that never changes. The count is the reactive part.

The footer buttons call `getAll()` and `clear()` on the instance, which is the
same handle you would use for `create()`, `remove()` or `export()`.
