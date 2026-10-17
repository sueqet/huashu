import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryTemplate, parseStoryTemplate } from "../src/lib/story-template.ts";
import { emptyCharacterContent } from "../src/lib/character-card.ts";

test("imports 1.0 templates with inline characters", () => {
  const parsed = parseStoryTemplate({
    format: "huashu-story-template",
    version: "1.0",
    templateMeta: { name: "雾港", author: "a", version: "1", description: "" },
    worldSetting: "世界",
    rules: "规则",
    openingMessage: "开场",
    characters: [{ name: "艾琳", description: "守灯人" }],
  });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.config.templateMeta?.name, "雾港");
  assert.equal(parsed.characters.length, 1);
  assert.equal(parsed.characters[0].content.name, "艾琳");
  assert.equal(parsed.characters[0].content.description, "守灯人");
});

test("2.0 templates round-trip characters, avatar, persona and mode", () => {
  const content = { ...emptyCharacterContent("艾琳"), personality: "沉稳", tags: ["悬疑"] };
  const file = buildStoryTemplate(
    {
      worldSetting: "世界",
      rules: "",
      characterIds: ["x"],
      openingMessage: "",
      chapterSummaries: [{ conversationId: "c", chapterNumber: 1, summary: "s", createdAt: 0 }],
      narrativeMode: "roleplay",
      persona: { name: "林", description: "侦探" },
    },
    [{ content, avatar: "data:image/png;base64,AAAA" }]
  );
  assert.equal(file.version, "2.0");
  assert.equal("chapterSummaries" in file, false);

  const parsed = parseStoryTemplate(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.config.narrativeMode, "roleplay");
  assert.deepEqual(parsed.config.persona, { name: "林", description: "侦探" });
  assert.deepEqual(parsed.characters[0].content, content);
  assert.equal(parsed.characters[0].avatar, "data:image/png;base64,AAAA");
});

test("rejects wrong formats and reports bad characters", () => {
  assert.match(parseStoryTemplate({ format: "other" }).errors[0], /format/);
  assert.match(parseStoryTemplate(null).errors[0], /期望对象/);

  const parsed = parseStoryTemplate({
    format: "huashu-story-template",
    worldSetting: "",
    rules: "",
    openingMessage: "",
    characters: [{ name: "" }, { card: { name: "" } }],
  });
  assert.equal(parsed.errors.length, 2);
});

test("ignores non-image avatars", () => {
  const parsed = parseStoryTemplate({
    format: "huashu-story-template",
    worldSetting: "",
    rules: "",
    openingMessage: "",
    characters: [{ card: { name: "A" }, avatar: "https://example.com/a.png" }],
  });
  assert.equal(parsed.characters[0].avatar, undefined);
});
