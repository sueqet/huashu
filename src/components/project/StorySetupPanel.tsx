import { useCallback, useEffect, useState } from "react";
import type { CharacterCard, NarrativeMode, Persona, StoryConfig } from "@/types";
import { useProjectStore } from "@/stores/project-store";
import { importStoryTemplate, exportStoryTemplate } from "@/services/story-service";
import { characterService } from "@/services/character-service";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { pickAndImportCharacters } from "@/components/characters/character-files";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import {
  Globe,
  ScrollText,
  Users,
  Upload,
  Download,
  UserPlus,
  BookOpen,
  UserRound,
  X,
  Crown,
} from "lucide-react";

interface StorySetupPanelProps {
  projectId: string;
  storyConfig: StoryConfig;
}

const textareaClass =
  "w-full p-3 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring";

const MODE_OPTIONS: Array<{ value: NarrativeMode; label: string; hint: string }> = [
  { value: "narrator", label: "叙事者", hint: "AI 作为旁白推进故事，每次给出选项" },
  { value: "roleplay", label: "角色扮演", hint: "AI 扮演第一个出场角色与你对话" },
];

export function StorySetupPanel({ projectId, storyConfig }: StorySetupPanelProps) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const [worldSetting, setWorldSetting] = useState(storyConfig.worldSetting);
  const [rules, setRules] = useState(storyConfig.rules);
  const [openingMessage, setOpeningMessage] = useState(storyConfig.openingMessage);
  const [persona, setPersona] = useState<Persona>(storyConfig.persona ?? { name: "", description: "" });
  const [cards, setCards] = useState<CharacterCard[]>([]);
  const [library, setLibrary] = useState<CharacterCard[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mode = storyConfig.narrativeMode ?? "narrator";
  const characterIds = storyConfig.characterIds;

  useEffect(() => {
    characterService.getMany(characterIds).then(setCards);
  }, [characterIds]);

  const saveConfig = useCallback(
    (updates: Partial<StoryConfig>) =>
      updateProject(projectId, {
        storyConfig: { ...storyConfig, worldSetting, rules, openingMessage, persona, ...updates },
      }),
    [projectId, storyConfig, worldSetting, rules, openingMessage, persona, updateProject]
  );

  const openPicker = async () => {
    setLibrary(await characterService.list());
    setPickerOpen(true);
  };

  const addCharacter = async (id: string) => {
    if (characterIds.includes(id)) return;
    await saveConfig({ characterIds: [...characterIds, id] });
    setPickerOpen(false);
  };

  const removeCharacter = (id: string) =>
    saveConfig({ characterIds: characterIds.filter((cid) => cid !== id) });

  const makeLead = (id: string) =>
    saveConfig({ characterIds: [id, ...characterIds.filter((cid) => cid !== id)] });

  const handleImportCards = async () => {
    const { imported, errors } = await pickAndImportCharacters();
    if (errors.length > 0) setMessage(errors.join("；"));
    if (imported.length > 0) {
      await saveConfig({ characterIds: [...characterIds, ...imported.map((c) => c.id)] });
      setPickerOpen(false);
    }
  };

  const handleImportTemplate = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "话树剧本", extensions: ["huashu-story"] }],
        multiple: false,
      });
      if (!filePath || Array.isArray(filePath)) return;

      const json = JSON.parse(new TextDecoder().decode(await readFile(filePath)));
      const { storyConfig: imported, errors } = await importStoryTemplate(json);
      if (errors.length > 0) {
        setMessage(errors.join("; "));
        return;
      }

      setWorldSetting(imported.worldSetting);
      setRules(imported.rules);
      setOpeningMessage(imported.openingMessage);
      setPersona(imported.persona ?? { name: "", description: "" });
      await updateProject(projectId, {
        storyConfig: { ...imported, chapterSummaries: storyConfig.chapterSummaries },
      });
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "导入失败");
    }
  };

  const handleExportTemplate = async () => {
    try {
      const template = await exportStoryTemplate(storyConfig);
      const savePath = await save({
        defaultPath: `${storyConfig.templateMeta?.name || "story-template"}.huashu-story`,
        filters: [{ name: "话树剧本", extensions: ["huashu-story"] }],
      });
      if (!savePath) return;
      await writeFile(savePath, new TextEncoder().encode(JSON.stringify(template, null, 2)));
    } catch (err) {
      setMessage(`导出剧本失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const available = library.filter((card) => !characterIds.includes(card.id));
  const missingCount = characterIds.length - cards.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleImportTemplate}>
          <Upload className="h-4 w-4 mr-1" />
          导入剧本
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportTemplate}>
          <Download className="h-4 w-4 mr-1" />
          导出剧本
        </Button>
        {message && <span className="text-xs text-destructive">{message}</span>}
      </div>

      {/* 叙事模式 */}
      <div>
        <div className="text-sm font-medium text-muted-foreground mb-2">叙事模式</div>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => saveConfig({ narrativeMode: option.value })}
              className={`rounded-lg border p-3 text-left ${
                mode === option.value ? "border-primary bg-primary/5" : "bg-card"
              }`}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{option.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <Globe className="h-4 w-4" />
          世界观设定
        </label>
        <textarea
          value={worldSetting}
          onChange={(e) => setWorldSetting(e.target.value)}
          onBlur={() => saveConfig({ worldSetting })}
          placeholder="描述故事的世界背景、时代、环境..."
          className={`${textareaClass} min-h-[120px]`}
        />
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <ScrollText className="h-4 w-4" />
          故事规则
        </label>
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          onBlur={() => saveConfig({ rules })}
          placeholder="说明玩法和叙事规则，例如：叙事风格、禁止行为、特殊机制..."
          className={`${textareaClass} min-h-[100px]`}
        />
      </div>

      {/* 出场角色 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Users className="h-4 w-4" />
            出场角色
          </label>
          <Button variant="outline" size="sm" onClick={openPicker}>
            <UserPlus className="h-4 w-4 mr-1" />
            添加
          </Button>
        </div>
        {mode === "roleplay" && cards.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">AI 扮演排在第一位的角色。</p>
        )}
        <div className="space-y-2">
          {cards.map((card, index) => (
            <div key={card.id} className="flex items-center gap-3 rounded-lg border bg-card p-2">
              <CharacterAvatar card={card} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{card.name}</span>
                  {mode === "roleplay" && index === 0 && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">主角色</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{card.description || "暂无描述"}</p>
              </div>
              {mode === "roleplay" && index > 0 && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => makeLead(card.id)} aria-label="设为主角色" title="设为主角色">
                  <Crown className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCharacter(card.id)} aria-label="移出故事">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {cards.length === 0 && (
            <p className="text-xs text-muted-foreground">还没有出场角色，点击"添加"从角色库选择或导入角色卡。</p>
          )}
          {missingCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>有 {missingCount} 个角色已从角色库删除。</span>
              <button
                className="underline"
                onClick={() => saveConfig({ characterIds: cards.map((card) => card.id) })}
              >
                移除
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 玩家人设 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <UserRound className="h-4 w-4" />
          玩家人设
        </label>
        <div className="space-y-2">
          <input
            value={persona.name}
            onChange={(e) => setPersona({ ...persona, name: e.target.value })}
            onBlur={() => saveConfig({ persona })}
            placeholder="你在故事中的名字（留空为“你”）"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <textarea
            value={persona.description}
            onChange={(e) => setPersona({ ...persona, description: e.target.value })}
            onBlur={() => saveConfig({ persona })}
            placeholder="你的身份、外貌、性格……（可选）"
            className={`${textareaClass} min-h-[70px]`}
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <BookOpen className="h-4 w-4" />
          开场白
        </label>
        <textarea
          value={openingMessage}
          onChange={(e) => setOpeningMessage(e.target.value)}
          onBlur={() => saveConfig({ openingMessage })}
          placeholder={
            mode === "roleplay"
              ? "留空则使用主角色的开场白"
              : "AI 的第一条消息，用于设定故事的起点..."
          }
          className={`${textareaClass} min-h-[80px]`}
        />
      </div>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen} size="md" title="添加出场角色">
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full" onClick={handleImportCards}>
            <Upload className="h-4 w-4 mr-1" />
            导入角色卡（PNG / JSON）
          </Button>
          {available.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              角色库里没有可添加的角色，可以先导入，或在“角色卡”页面新建。
            </p>
          ) : (
            available.map((card) => (
              <button
                key={card.id}
                className="w-full flex items-center gap-3 rounded-lg border bg-card p-2 text-left active:bg-accent"
                onClick={() => addCharacter(card.id)}
              >
                <CharacterAvatar card={card} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{card.name}</div>
                  <p className="text-xs text-muted-foreground truncate">{card.description || "暂无描述"}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </Sheet>
    </div>
  );
}
