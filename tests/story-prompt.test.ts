import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostHistoryInstruction,
  buildStorySystemPrompt,
  DEFAULT_OPENING,
  getStoryOpening,
} from "../src/lib/story-prompt.ts";
import { emptyCharacterContent } from "../src/lib/character-card.ts";
import type { StoryConfig } from "../src/types/story.ts";

const base: StoryConfig = {
  worldSetting: "雾港",
  rules: "",
  characterIds: [],
  openingMessage: "",
  chapterSummaries: [],
};

const erin = {
  ...emptyCharacterContent("艾琳"),
  description: "{{char}}守护灯塔，认识{{user}}。",
  personality: "沉稳",
  firstMessage: "*{{char}}点亮灯* 你来了，{{user}}。",
  exampleDialogue: "<START>\n{{user}}: 你好\n{{char}}: 嗯。",
  postHistoryInstructions: "{{char}}不会透露秘密。",
};
const bob = { ...emptyCharacterContent("鲍勃"), description: "{{char}}是水手。" };

test("narrator prompt lists all characters with their own macros and ends with choices", () => {
  const prompt = buildStorySystemPrompt({ ...base, persona: { name: "林", description: "侦探" } }, [erin, bob]);
  assert.match(prompt, /\[世界观设定\]\n雾港/);
  assert.match(prompt, /### 艾琳\n艾琳守护灯塔，认识林。\n性格：沉稳/);
  assert.match(prompt, /### 鲍勃\n鲍勃是水手。/);
  assert.match(prompt, /\[玩家\]\n玩家扮演：林\n侦探/);
  assert.match(prompt, /林: 你好\n艾琳: 嗯。/);
  assert.ok(prompt.trimEnd().endsWith("[选项3] 选项内容"));
  assert.equal(prompt.includes("{{"), false);
});

test("roleplay prompt starts with the main character instruction", () => {
  const prompt = buildStorySystemPrompt({ ...base, narrativeMode: "roleplay" }, [erin, bob]);
  assert.ok(prompt.startsWith("[指令]\n你将扮演艾琳，与你进行角色扮演。"));
  assert.match(prompt, /\[角色设定\]\n### 艾琳/);
  assert.match(prompt, /\[其他角色\]\n### 鲍勃/);
  assert.equal(prompt.includes("[选项1]"), false);
  // 角色扮演只附主角色的示例对话
  const withExamples = buildStorySystemPrompt({ ...base, narrativeMode: "roleplay" }, [
    erin,
    { ...bob, exampleDialogue: "<START>\n{{char}}: 起锚！" },
  ]);
  assert.match(withExamples, /艾琳: 嗯。/);
  assert.equal(withExamples.includes("起锚"), false);
});

test("a card system prompt replaces the default roleplay instruction", () => {
  const prompt = buildStorySystemPrompt({ ...base, narrativeMode: "roleplay" }, [
    { ...erin, systemPrompt: "你是{{char}}。" },
  ]);
  assert.ok(prompt.startsWith("[指令]\n你是艾琳。"));
});

test("chapter summaries are all kept", () => {
  const summaries = Array.from({ length: 7 }, (_, i) => ({
    conversationId: `c${i}`,
    chapterNumber: i + 1,
    summary: `摘要${i + 1}`,
    createdAt: 0,
  }));
  const prompt = buildStorySystemPrompt({ ...base, chapterSummaries: summaries });
  assert.match(prompt, /第1章: 摘要1[\s\S]*第7章: 摘要7/);
});

test("post-history instructions only apply to roleplay", () => {
  assert.equal(buildPostHistoryInstruction(base, [erin]), "");
  assert.equal(buildPostHistoryInstruction({ ...base, narrativeMode: "roleplay" }, [erin]), "艾琳不会透露秘密。");
  assert.equal(buildPostHistoryInstruction({ ...base, narrativeMode: "roleplay" }, []), "");
});

test("opening prefers the story text, then the roleplay first message", () => {
  assert.equal(getStoryOpening({ ...base, openingMessage: " 你好，{{user}} " }, [erin]), "你好，你");
  assert.equal(getStoryOpening({ ...base, narrativeMode: "roleplay" }, [erin]), "*艾琳点亮灯* 你来了，你。");
  assert.equal(getStoryOpening(base, [erin]), DEFAULT_OPENING);
});
