/**
 * Rendering plugin hooks (design doc §9).
 *
 * Plugins can add template filters (`{{myfilter:Field}}`), transform the inputs before rendering
 * and post-process the generated HTML. Example — a filter that upper-cases a field:
 *
 * ```ts
 * registerPlugin({
 *   name: "shout",
 *   filters: { shout: (text) => text.toUpperCase() },
 * });
 * ```
 *
 * See `docs/plugins.md` for the JLAB Kanji replacement use case.
 */

export type CardSide = "question" | "answer";

export interface RenderContext {
  side: CardSide;
  /** Note field values by field name. */
  fields: Record<string, string>;
  tags: string[];
  noteTypeName: string;
  templateName: string;
  deckName: string;
  /** Template index (standard note types) or cloze number minus one. */
  ord: number;
  isCloze: boolean;
}

export interface FilterContext extends RenderContext {
  fieldName: string;
  /** Text after the filter name, e.g. `en_US` for `{{tts en_US:Field}}`. */
  args: string;
}

export type TemplateFilter = (text: string, context: FilterContext) => string;

export interface RenderPlugin {
  name: string;
  filters?: Record<string, TemplateFilter>;
  /** Adjust the context (e.g. rewrite field values) before the template is rendered. */
  beforeRender?: (context: RenderContext) => RenderContext | void;
  /** Transform the rendered (unsanitised) HTML of one side. */
  afterRender?: (html: string, context: RenderContext) => string;
}

const plugins = new Map<string, RenderPlugin>();

/** Register (or replace) a plugin. Returns a function that unregisters it. */
export function registerPlugin(plugin: RenderPlugin): () => void {
  plugins.set(plugin.name, plugin);
  return () => {
    if (plugins.get(plugin.name) === plugin) plugins.delete(plugin.name);
  };
}

export function registeredPlugins(): RenderPlugin[] {
  return [...plugins.values()];
}

export function pluginFilter(name: string): TemplateFilter | undefined {
  for (const plugin of [...plugins.values()].reverse()) {
    const filter = plugin.filters?.[name];
    if (filter) return filter;
  }
  return undefined;
}
