import { useState } from "react";
import type { StoryConfig, StoryCharacter } from "@/types";
import { useProjectStore } from "@/stores/project-store";
import { importStoryTemplate, exportStoryTemplate } from "@/services/story-service";
import { Button } from "@/components/ui/button";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import {
  Globe,
  ScrollText,
  Users,
  Trash2,
  Upload,
  Download,
  UserPlus,
  BookOpen,
} from "lucide-react";

interface StorySetupPanelProps {
  projectId: string;
  storyConfig: StoryConfig;
}

export function StorySetupPanel({ projectId, storyConfig }: StorySetupPanelProps) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const [worldSetting, setWorldSetting] = useState(storyConfig.worldSetting);
  const [rules, setRules] = useState(storyConfig.rules);
  const [characters, setCharacters] = useState<StoryCharacter[]>(storyConfig.characters);
  const [openingMessage, setOpeningMessage] = useState(storyConfig.openingMessage);
  const [newCharName, setNewCharName] = useState("");
  const [newCharDesc, setNewCharDesc] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const saveConfig = async (updates: Partial<StoryConfig>) => {
    await updateProject(projectId, {
      storyConfig: {
        ...storyConfig,
        worldSetting,
        rules,
        characters,
        openingMessage,
        ...updates,
      },
    });
  };

  const handleWorldSettingBlur = () => saveConfig({ worldSetting });
  const handleRulesBlur = () => saveConfig({ rules });
  const handleOpeningMessageBlur = () => saveConfig({ openingMessage });

  const handleAddCharacter = async () => {
    if (!newCharName.trim()) return;
    const newChar: StoryCharacter = {
      name: newCharName.trim(),
      description: newCharDesc.trim(),
      isOriginal: false,
    };
    const updated = [...characters, newChar];
    setCharacters(updated);
    setNewCharName("");
    setNewCharDesc("");
    await saveConfig({ characters: updated });
  };

  const handleRemoveCharacter = async (index: number) => {
    const updated = characters.filter((_, i) => i !== index);
    setCharacters(updated);
    await saveConfig({ characters: updated });
  };

  const handleImportTemplate = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "话树剧本", extensions: ["huashu-story"] }],
        multiple: false,
      });
      if (!filePath) return;

      const data = await readFile(filePath as string);
      const text = new TextDecoder().decode(data);
      const json = JSON.parse(text);

      const { storyConfig, errors } = importStoryTemplate(json);
      if (errors.length > 0) {
        setImportError(errors.join("; "));
        return;
      }

      setWorldSetting(storyConfig.worldSetting);
      setRules(storyConfig.rules);
      setCharacters(storyConfig.characters);
      setOpeningMessage(storyConfig.openingMessage);
      await saveConfig(storyConfig);
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "导入失败");
    }
  };

  const handleExportTemplate = async () => {
    try {
      const template = exportStoryTemplate(storyConfig);
      const json = JSON.stringify(template, null, 2);

      const savePath = await save({
        defaultPath: `${storyConfig.templateMeta?.name || "story-template"}.huashu-story`,
        filters: [{ name: "话树剧本", extensions: ["huashu-story"] }],
      });
      if (!savePath) return;

      await writeFile(savePath, new TextEncoder().encode(json));
    } catch (err) {
      console.error("导出剧本失败:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* 导入/导出按钮 */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleImportTemplate}>
          <Upload className="h-4 w-4 mr-1" />
          导入剧本
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportTemplate}>
          <Download className="h-4 w-4 mr-1" />
          导出剧本
        </Button>
        {importError && (
          <span className="text-xs text-destructive">{importError}</span>
        )}
      </div>

      {/* 世界观设定 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <Globe className="h-4 w-4" />
          世界观设定
        </label>
        <textarea
          value={worldSetting}
          onChange={(e) => setWorldSetting(e.target.value)}
          onBlur={handleWorldSettingBlur}
          placeholder="描述故事的世界背景、时代、环境..."
          className="w-full min-h-[120px] p-3 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 故事规则 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <ScrollText className="h-4 w-4" />
          故事规则
        </label>
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          onBlur={handleRulesBlur}
          placeholder="说明玩法和叙事规则，例如：叙事风格、禁止行为、特殊机制..."
          className="w-full min-h-[100px] p-3 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 角色管理 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <Users className="h-4 w-4" />
          角色列表
        </label>
        <div className="space-y-2 mb-3">
          {characters.map((char, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-2 border rounded-lg bg-card"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{char.name}</span>
                  {char.isOriginal && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      模板
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {char.description}
                </p>
              </div>
              {!char.isOriginal && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleRemoveCharacter(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 p-2 border rounded-lg bg-muted/30">
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              placeholder="角色名"
              className="w-full bg-transparent outline-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCharacter();
              }}
            />
            <input
              type="text"
              value={newCharDesc}
              onChange={(e) => setNewCharDesc(e.target.value)}
              placeholder="角色描述"
              className="w-full bg-transparent outline-none text-xs text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCharacter();
              }}
            />
          </div>
          <Button
            size="sm"
            onClick={handleAddCharacter}
            disabled={!newCharName.trim()}
          >
            <UserPlus className="h-3 w-3 mr-1" />
            添加
          </Button>
        </div>
      </div>

      {/* 开场白 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
          <BookOpen className="h-4 w-4" />
          开场白
        </label>
        <textarea
          value={openingMessage}
          onChange={(e) => setOpeningMessage(e.target.value)}
          onBlur={handleOpeningMessageBlur}
          placeholder="AI 的第一条消息，用于设定故事的起点..."
          className="w-full min-h-[80px] p-3 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}
