<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { annotate } from 'penciled';
import 'penciled/styles.css';

// A template ref is all `annotate()` needs: it takes an element or a selector,
// and the element only exists once Vue has mounted the template.
const article = ref(null);
const count = ref(0);

let instance = null;

const refreshCount = () => {
  if (instance) count.value = instance.getAll().length;
};

onMounted(async () => {
  // The instance is what keeps the annotations reachable: call `getAll()`,
  // `clear()` or `destroy()` on it rather than on the module.
  instance = annotate(article.value, { documentId: 'vue-example' });
  // Stored annotations are read asynchronously, so the first count has to wait.
  await instance.ready;
  refreshCount();
});

onUnmounted(() => {
  // Annotations persist in storage, but the listeners, the toolbar and the
  // CSS Custom Highlight registrations belong to the instance. Without this a
  // hot reload or a route change would stack a second copy on the page.
  instance?.destroy();
  instance = null;
});

const clearAll = () => {
  if (!instance) return;
  instance.clear();
  refreshCount();
};
</script>

<template>
  <main>
    <h1>penciled with Vue 3</h1>
    <p class="hint">
      Select a few words below and a small toolbar appears. Pick a color to highlight them, or
      write a note. Click a highlight to change it or remove it.
    </p>

    <article ref="article">
      <p>
        The element only has to exist when <code>annotate()</code> runs, so a template ref in
        <code>onMounted</code> is enough. There is no Vue adapter to install: penciled is
        framework-agnostic and works on the DOM node itself.
      </p>
      <p>
        Annotations are saved in this browser under the <code>vue-example</code> document id.
        Reload the page and they come back where you left them, because the instance reads from
        storage when it is created.
      </p>
      <p>
        The instance is kept in a plain variable rather than a reactive ref. It holds DOM listeners
        and highlight registrations, not display state, so wrapping it in <code>ref()</code> would
        only make Vue track something that never changes.
      </p>
    </article>

    <footer>
      <span>{{ count }} annotation{{ count === 1 ? '' : 's' }}</span>
      <button type="button" @click="refreshCount">Refresh count</button>
      <button type="button" @click="clearAll" :disabled="count === 0">Clear all</button>
    </footer>
  </main>
</template>

<style>
body {
  max-width: 38rem;
  margin: 3rem auto;
  padding: 0 1rem;
  font: 1.125rem / 1.7 Georgia, serif;
}

.hint {
  color: #555;
  font-size: 0.95rem;
}

footer {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 2rem;
  font-size: 0.9rem;
}

footer button {
  font: inherit;
  padding: 0.35rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 0.35rem;
  background: #fff;
  cursor: pointer;
}

footer button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
