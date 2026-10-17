/**
 * 故事模式提示词组装（纯逻辑，不依赖 Tauri）
 */
import type { CharacterCard } from "../types/character";
import type { StoryConfig } from "../types/story";
import { applyMacros, formatExampleDialogue, type MacroContext } from "./character-card.ts";

export const DEFAULT_USER_NAME = "你";
export const DEFAULT_OPENING = "故事开始了。请开始你的叙述……";

const NARRATOR_INSTRUCTION =
  "你是一位互动小说的叙事者。请根据玩家的选择推进故事，撰写引人入胜的情节。" +
  "每次回复末尾，请提供2-4个选项供玩家选择，格式为：\n[选项1] 选项内容\n[选项2] 选项内容\n[选项3] 选项内容";

const ROLEPLAY_INSTRUCTION =
  "你将扮演{{char}}，与{{user}}进行角色扮演。始终以{{char}}的身份、语气和视角回应，" +
  "描写{{char}}的言行、神态与内心，推动情节发展。不要替{{user}}做决定或发言。";

type StoryCharacterInput = Pick<
  CharacterCard,
  | "name"
  | "description"
  | "personality"
  | "scenario"
  | "firstMessage"
  | "exampleDialogue"
  | "systemPrompt"
  | "postHistoryInstructions"
>;

function userName(config: StoryConfig): string {
  return config.persona?.name.trim() || DEFAULT_USER_NAME;
}

function macroContext(config: StoryConfig, char: StoryCharacterInput | undefined): MacroContext {
  return { char: char?.name || "叙事者", user: userName(config) };
}

function describeCharacter(card: StoryCharacterInput, ctx: MacroContext): string {
  const lines = [`### ${card.name}`];
  const description = applyMacros(card.description, ctx).trim();
  const personality = applyMacros(card.personality, ctx).trim();
  const scenario = applyMacros(card.scenario, ctx).trim();
  if (description) lines.push(description);
  if (personality) lines.push(`性格：${personality}`);
  if (scenario) lines.push(`场景：${scenario}`);
  return lines.join("\n");
}

/**
 * 构建故事模式的 System Prompt
 *
 * 叙事者模式：世界观 → 规则 → 出场角色 → 玩家 → 对话示例 → 前情提要 → 叙事指令
 * 角色扮演模式：扮演指令（可被角色卡的 system_prompt 替换）→ 世界观 → 规则 → 角色设定 → 其他角色 → 玩家 → 对话示例 → 前情提要
 */
export function buildStorySystemPrompt(
  config: StoryConfig,
  characters: StoryCharacterInput[] = []
): string {
  const mode = config.narrativeMode ?? "narrator";
  const main = characters[0];
  const sections: string[] = [];

  if (mode === "roleplay") {
    const ctx = macroContext(config, main);
    const instruction = main?.systemPrompt.trim() || ROLEPLAY_INSTRUCTION;
    sections.push(`[指令]\n${applyMacros(instruction, ctx)}`);
  }

  if (config.worldSetting.trim()) sections.push(`[世界观设定]\n${config.worldSetting.trim()}`);
  if (config.rules.trim()) sections.push(`[故事规则]\n${config.rules.trim()}`);

  if (characters.length > 0) {
    const described = characters.map((card) => describeCharacter(card, macroContext(config, card)));
    if (mode === "roleplay") {
      sections.push(`[角色设定]\n${described[0]}`);
      if (described.length > 1) sections.push(`[其他角色]\n${described.slice(1).join("\n\n")}`);
    } else {
      sections.push(`[出场角色]\n${described.join("\n\n")}`);
    }
  }

  const persona = config.persona;
  if (persona && (persona.name.trim() || persona.description.trim())) {
    const name = userName(config);
    const description = applyMacros(persona.description, macroContext(config, main)).trim();
    sections.push(`[玩家]\n玩家扮演：${name}${description ? `\n${description}` : ""}`);
  }

  const exampleSources = mode === "roleplay" ? characters.slice(0, 1) : characters;
  const examples = exampleSources
    .map((card) => {
      const blocks = formatExampleDialogue(card.exampleDialogue, macroContext(config, card));
      return blocks.length > 0 ? `### ${card.name}\n${blocks.join("\n\n")}` : "";
    })
    .filter(Boolean);
  if (examples.length > 0) {
    sections.push(`[对话示例]（仅用于参考说话风格，不是已发生的剧情）\n${examples.join("\n\n")}`);
  }

  if (config.chapterSummaries.length > 0) {
    const summaryText = config.chapterSummaries
      .map((s) => `第${s.chapterNumber}章: ${s.summary}`)
      .join("\n");
    sections.push(`[前情提要]\n${summaryText}`);
  }

  if (mode === "narrator") {
    sections.push(`[指令]\n${NARRATOR_INSTRUCTION}`);
  }

  return sections.join("\n\n");
}

/** 放在对话历史之后的指令（角色扮演模式下取主角色的 post_history_instructions） */
export function buildPostHistoryInstruction(
  config: StoryConfig,
  characters: StoryCharacterInput[] = []
): string {
  const main = characters[0];
  if ((config.narrativeMode ?? "narrator") !== "roleplay" || !main) return "";
  return applyMacros(main.postHistoryInstructions, macroContext(config, main)).trim();
}

/** 新章节的开场白：故事开场白 → 角色扮演模式下主角色的开场白 → 默认文本 */
export function getStoryOpening(
  config: StoryConfig,
  characters: StoryCharacterInput[] = []
): string {
  const main = characters[0];
  const ctx = macroContext(config, main);
  const opening = config.openingMessage.trim();
  if (opening) return applyMacros(opening, ctx);
  if ((config.narrativeMode ?? "narrator") === "roleplay" && main?.firstMessage.trim()) {
    return applyMacros(main.firstMessage.trim(), ctx);
  }
  return DEFAULT_OPENING;
}
