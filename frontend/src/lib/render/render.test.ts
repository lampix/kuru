import { afterEach, describe, expect, it } from "vitest";

import {
  type NoteTypeLike,
  clozeOrdinals,
  mediaUrl,
  parseTemplate,
  registerPlugin,
  renderCard,
  renderCloze,
  renderTemplate,
  rewriteCssUrls,
} from ".";
import type { RenderContext } from "./plugins";
import { compareAnswer } from "./type-answer";

const basic: NoteTypeLike = {
  name: "Basic",
  kind: 0,
  fields: [
    { name: "Front", ord: 0 },
    { name: "Back", ord: 1 },
  ],
  templates: [
    { name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr id=answer>{{Back}}" },
    { name: "Card 2", ord: 1, qfmt: "{{#Back}}{{Back}}{{/Back}}", afmt: "{{Front}}" },
  ],
  css: ".card { font-family: 'MyFont'; } @font-face { src: url('_font.woff2'); }",
};

const cloze: NoteTypeLike = {
  name: "Cloze",
  kind: 1,
  fields: [
    { name: "Text", ord: 0 },
    { name: "Extra", ord: 1 },
  ],
  templates: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>{{Extra}}" }],
  css: "",
};

const ctx = (fields: Record<string, string>, extra: Partial<RenderContext> = {}): RenderContext => ({
  side: "question",
  fields,
  tags: ["jp", "n5"],
  noteTypeName: "Basic",
  templateName: "Card 1",
  deckName: "Japanese::Vocab",
  ord: 0,
  isCloze: false,
  ...extra,
});

describe("template engine", () => {
  it("replaces fields and special fields", () => {
    const { html } = renderTemplate(
      "{{Front}} | {{Tags}} | {{Deck}} | {{Subdeck}} | {{Type}} | {{Card}}",
      ctx({ Front: "犬" }),
    );
    expect(html).toBe("犬 | jp n5 | Japanese::Vocab | Vocab | Basic | Card 1");
  });

  it("handles conditional sections", () => {
    const template = "{{#Extra}}has {{Extra}}{{/Extra}}{{^Extra}}none{{/Extra}}";
    expect(renderTemplate(template, ctx({ Extra: "x" })).html).toBe("has x");
    expect(renderTemplate(template, ctx({ Extra: "<br> &nbsp;" })).html).toBe("none");
    expect(renderTemplate(template, ctx({ Extra: '<img src="a.png">' })).html).toContain("has");
  });

  it("ignores comments and reports unknown fields", () => {
    expect(renderTemplate("{{!note}}{{Missing}}", ctx({})).html).toContain("unknown field");
  });

  it("rejects unbalanced sections", () => {
    expect(() => parseTemplate("{{#A}}x")).toThrow();
    expect(() => parseTemplate("{{#A}}x{{/B}}")).toThrow();
  });

  it("applies filters right to left", () => {
    const { html } = renderTemplate("{{text:Front}}", ctx({ Front: "<b>bold</b> &amp; co" }));
    expect(html).toBe("bold &amp; co");
  });

  it("renders furigana, kana and kanji", () => {
    const fields = { Reading: "日本[にほん]語[ご]" };
    expect(renderTemplate("{{furigana:Reading}}", ctx(fields)).html).toBe(
      "<ruby><rb>日本</rb><rt>にほん</rt></ruby><ruby><rb>語</rb><rt>ご</rt></ruby>",
    );
    expect(renderTemplate("{{kana:Reading}}", ctx(fields)).html).toBe("にほんご");
    expect(renderTemplate("{{kanji:Reading}}", ctx(fields)).html).toBe("日本語");
  });

  it("hides tts fields and renders hints", () => {
    expect(renderTemplate("{{tts en_US:Front}}", ctx({ Front: "hi" })).html).toBe("");
    expect(renderTemplate("{{hint:Front}}", ctx({ Front: "hi" })).html).toContain("<details");
  });
});

describe("cloze", () => {
  const text = "{{c1::Tokyo::city}} is the capital of {{c2::Japan}}";

  it("hides the active cloze on the question", () => {
    const html = renderCloze(text, 1, "question");
    expect(html).toContain('<span class="cloze" data-cloze="Tokyo" data-ordinal="1">[city]</span>');
    expect(html).toContain('<span class="cloze-inactive" data-ordinal="2">Japan</span>');
  });

  it("reveals it on the answer", () => {
    expect(renderCloze(text, 2, "answer")).toContain(
      '<span class="cloze" data-ordinal="2">Japan</span>',
    );
  });

  it("supports nesting and shared ordinals", () => {
    const nested = "{{c1::outer {{c2::inner}} text}} and {{c1,3::shared}}";
    expect(clozeOrdinals(nested)).toEqual([1, 2, 3]);
    expect(renderCloze(nested, 2, "question")).toContain("[...]");
    expect(renderCloze(nested, 3, "question")).toMatch(/data-ordinal="1,3">\[\.\.\.\]/);
    expect(renderCloze("{{c1::unclosed", 1, "question")).toBe("{{c1::unclosed");
  });
});

describe("renderCard", () => {
  it("renders FrontSide on the answer and exposes sounds", () => {
    const rendered = renderCard(basic, {
      ord: 0,
      fields: ["Hund [sound:hund.mp3]", "dog [sound:dog.mp3]"],
      tags: [],
    });
    expect(rendered.question).toContain('data-sound="hund.mp3"');
    expect(rendered.answer).toContain("Hund");
    expect(rendered.answer).toContain('<hr id="answer">');
    expect(rendered.questionSounds).toEqual(["hund.mp3"]);
    expect(rendered.answerSounds).toEqual(["dog.mp3"]);
  });

  it("selects the template by ordinal", () => {
    const rendered = renderCard(basic, { ord: 1, fields: ["front", "back"], tags: [] });
    expect(rendered.question).toBe("back");
  });

  it("uses the cloze ordinal for cloze note types", () => {
    const rendered = renderCard(cloze, {
      ord: 1,
      fields: ["{{c1::a}} {{c2::b}}", "extra"],
      tags: [],
    });
    expect(rendered.question).toContain("[...]");
    expect(rendered.question).toContain(">a<");
    expect(rendered.answer).toContain('<span class="cloze" data-ordinal="2">b</span>');
  });

  it("sanitises scripts and rewrites media paths", () => {
    const rendered = renderCard(basic, {
      ord: 0,
      fields: ['<img src="cat image.png" onerror="alert(1)"><script>alert(2)</script>', ""],
      tags: [],
    });
    expect(rendered.question).not.toContain("onerror");
    expect(rendered.question).not.toContain("<script");
    expect(rendered.question).toContain(`src="${mediaUrl("cat image.png")}"`);
    expect(rendered.css).toContain(`url('${mediaUrl("_font.woff2")}')`);
  });

  it("compares typed answers", () => {
    const typing: NoteTypeLike = {
      ...basic,
      templates: [{ name: "T", ord: 0, qfmt: "{{Front}} {{type:Back}}", afmt: "{{Front}}<hr>{{type:Back}}" }],
    };
    const card = { ord: 0, fields: ["Hund", "dog"], tags: [] };
    const front = renderCard(typing, card);
    expect(front.hasTypeAnswer).toBe(true);
    expect(front.question).toContain('id="typeans"');
    const back = renderCard(typing, card, { typedAnswer: "dgo" });
    expect(back.answer).toContain("typeBad");
    expect(renderCard(typing, card, { typedAnswer: "dog" }).answer).toContain("typeGood");
  });

  it("reports missing templates", () => {
    expect(renderCard(basic, { ord: 5, fields: [], tags: [] }).question).toContain("not found");
  });
});

describe("plugins", () => {
  const unregister: Array<() => void> = [];
  afterEach(() => unregister.splice(0).forEach((fn) => fn()));

  it("adds filters and hooks", () => {
    unregister.push(
      registerPlugin({
        name: "test",
        filters: { shout: (text) => text.toUpperCase() },
        beforeRender: (c) => ({ ...c, fields: { ...c.fields, Front: `${c.fields.Front}!` } }),
        afterRender: (html, c) => (c.side === "question" ? `<div class="wrapped">${html}</div>` : html),
      }),
    );
    const noteType = { ...basic, templates: [{ ...basic.templates[0]!, qfmt: "{{shout:Front}}" }] };
    const rendered = renderCard(noteType, { ord: 0, fields: ["hi", ""], tags: [] });
    expect(rendered.question).toBe('<div class="wrapped">HI!</div>');
  });
});

describe("helpers", () => {
  it("diffs answers", () => {
    expect(compareAnswer("abc", "abc")).toContain("typeGood");
    expect(compareAnswer("abc", "")).toContain("typeMissed");
  });

  it("only rewrites relative CSS urls", () => {
    expect(rewriteCssUrls("url(https://x.y/a.png) url(data:abc) url(b.png)")).toBe(
      `url(https://x.y/a.png) url(data:abc) url(${mediaUrl("b.png")})`,
    );
  });
});
