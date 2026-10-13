# Rendering plugins

Kuru renders Anki templates in `frontend/src/lib/render`. Plugins hook into this pipeline to add
deck-specific behaviour without touching the core.

```
fields ─▶ beforeRender ─▶ template engine (+ filters) ─▶ afterRender ─▶ sanitise ─▶ Shadow DOM
```

## API

```ts
import { registerPlugin } from "@/lib/render";

const unregister = registerPlugin({
  name: "my-plugin",
  // New template filters, usable as {{myfilter:Field}} or {{myfilter arg:Field}}.
  filters: {
    myfilter: (text, ctx) => text.toUpperCase(),
  },
  // Adjust field values, tags, … before rendering.
  beforeRender: (ctx) => ({ ...ctx, fields: { ...ctx.fields } }),
  // Post-process the HTML of each side (before sanitisation).
  afterRender: (html, ctx) => html,
});
```

* Filters registered by plugins take precedence over built-ins, so a plugin can override e.g.
  `furigana`.
* The context (`RenderContext`) provides the side (`question` / `answer`), fields by name, tags,
  note type, template and deck names, and the card ordinal.
* Output is always sanitised afterwards: plugins cannot inject scripts or event handlers.

## Built-in filters

`text`, `cloze`, `cloze-only`, `type` (incl. `type:cloze`), `hint`, `furigana`, `kana`, `kanji`, and
`tts` (hidden — text-to-speech is not supported). Unknown filters are ignored, like in Anki.

## Example: JLAB Kanji replacement

The [JLAB](https://jlab.wiki) deck can show words in kana until the learner has studied the
corresponding Heisig kanji frames. A plugin could implement this as a filter:

```ts
registerPlugin({
  name: "jlab-kanji",
  filters: {
    jlab: (text) => text.replace(/(\p{Script=Han})\[(.+?)\]/gu, (_m, kanji, kana) =>
      knownKanji.has(kanji) ? kanji : kana,
    ),
  },
});
```

Here `knownKanji` would be derived from the learner's Heisig deck in IndexedDB.
