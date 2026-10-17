import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import type { CharacterCard } from "@/types";
import { characterService } from "@/services/character-service";

/** 选择并导入 SillyTavern 角色卡（可多选），返回导入成功的卡片和失败信息 */
export async function pickAndImportCharacters(): Promise<{
  imported: CharacterCard[];
  errors: string[];
}> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "角色卡", extensions: ["png", "json"] }],
  });
  if (!selected) return { imported: [], errors: [] };

  const paths = Array.isArray(selected) ? selected : [selected];
  const imported: CharacterCard[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    const filename = decodeURIComponent(path.split(/[/\\]/).pop() || path);
    try {
      imported.push(await characterService.importFile(await readFile(path)));
    } catch (err) {
      errors.push(`${filename}：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { imported, errors };
}

/** 导出角色卡到用户选择的位置；返回是否已保存 */
export async function exportCharacter(card: CharacterCard, format: "png" | "json"): Promise<boolean> {
  const savePath = await save({
    defaultPath: `${card.name || "character"}.${format}`,
    filters: [{ name: format === "png" ? "PNG 角色卡" : "JSON 角色卡", extensions: [format] }],
  });
  if (!savePath) return false;
  const bytes = format === "png" ? await characterService.exportPng(card) : characterService.exportJson(card);
  await writeFile(savePath, bytes);
  return true;
}
