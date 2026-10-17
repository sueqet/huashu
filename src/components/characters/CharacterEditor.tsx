import { useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { CharacterCard } from "@/types";
import { characterService } from "@/services/character-service";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { CharacterAvatar } from "./CharacterAvatar";
import { exportCharacter } from "./character-files";

interface CharacterEditorProps {
  characterId: string;
  onBack: () => void;
}

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function TextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={`${inputClass} resize-y leading-relaxed`}
    />
  );
}

function characterBookEntryCount(book: unknown): number {
  if (!book || typeof book !== "object") return 0;
  const entries = (book as { entries?: unknown }).entries;
  if (Array.isArray(entries)) return entries.length;
  return entries && typeof entries === "object" ? Object.keys(entries).length : 0;
}

/** 角色卡编辑页（手机全屏） */
export function CharacterEditor({ characterId, onBack }: CharacterEditorProps) {
  const [saved, setSaved] = useState<CharacterCard | null>(null);
  const [draft, setDraft] = useState<CharacterCard | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    characterService.get(characterId).then((card) => {
      if (!card) {
        setMissing(true);
        return;
      }
      setSaved(card);
      setDraft(card);
    });
  }, [characterId]);

  const dirty = useMemo(
    () => !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft]
  );

  if (missing) {
    return (
      <div className="flex-1 p-6 space-y-3">
        <p className="text-sm text-muted-foreground">这个角色已被删除。</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          返回角色库
        </Button>
      </div>
    );
  }
  if (!draft || !saved) {
    return <div className="flex-1 p-6 text-sm text-muted-foreground">正在加载...</div>;
  }

  const update = <K extends keyof CharacterCard>(key: K, value: CharacterCard[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      flash("名称不能为空");
      return;
    }
    setSaving(true);
    try {
      const updated = await characterService.save({ ...draft, name: draft.name.trim() });
      setSaved(updated);
      setDraft(updated);
      flash("已保存");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (dirty && !(await confirm({ title: "放弃未保存的修改？" }))) return;
    onBack();
  };

  const handleAvatar = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      const updated = await characterService.setAvatar(saved, await readFile(selected));
      setSaved((prev) => (prev ? { ...prev, avatar: updated.avatar, updatedAt: updated.updatedAt } : prev));
      setDraft((prev) => (prev ? { ...prev, avatar: updated.avatar, updatedAt: updated.updatedAt } : prev));
    } catch (err) {
      flash(`更换头像失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExport = async (format: "png" | "json") => {
    if (dirty) {
      flash("请先保存修改再导出");
      return;
    }
    try {
      if (await exportCharacter(saved, format)) flash("已导出");
    } catch (err) {
      flash(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `删除角色"${saved.name}"？`,
      description: "删除后无法恢复，使用该角色的故事将不再包含它。",
    });
    if (!ok) return;
    await characterService.remove(saved);
    onBack();
  };

  const greetings = draft.alternateGreetings;
  const bookEntries = characterBookEntryCount(draft.characterBook);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-2 py-2">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleBack} aria-label="返回">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="flex-1 truncate font-medium">{draft.name || "未命名角色"}</h2>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
        <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
          <Save className="h-4 w-4 mr-1" />
          保存
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-10">
        <div className="flex items-center gap-4">
          <CharacterAvatar card={draft} className="h-24 w-24 text-3xl" />
          <Button variant="outline" size="sm" onClick={handleAvatar}>
            <ImagePlus className="h-4 w-4 mr-1" />
            更换头像
          </Button>
        </div>

        <Field label="名称">
          <input className={inputClass} value={draft.name} onChange={(e) => update("name", e.target.value)} />
        </Field>

        <Field label="描述" hint="身份、外貌、背景等。可用 {{char}} 指代角色，{{user}} 指代玩家。">
          <TextArea value={draft.description} onChange={(v) => update("description", v)} rows={6} />
        </Field>

        <Field label="性格">
          <TextArea value={draft.personality} onChange={(v) => update("personality", v)} rows={3} />
        </Field>

        <Field label="场景" hint="故事开始时的情境。">
          <TextArea value={draft.scenario} onChange={(v) => update("scenario", v)} rows={3} />
        </Field>

        <Field label="开场白" hint="角色扮演模式下作为第一条消息（故事未设置开场白时）。">
          <TextArea value={draft.firstMessage} onChange={(v) => update("firstMessage", v)} rows={4} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">备选开场白</span>
            <Button variant="ghost" size="sm" onClick={() => update("alternateGreetings", [...greetings, ""])}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
          {greetings.map((greeting, index) => (
            <div key={index} className="flex items-start gap-2">
              <TextArea
                value={greeting}
                rows={3}
                onChange={(v) => update("alternateGreetings", greetings.map((g, i) => (i === index ? v : g)))}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="删除这条开场白"
                onClick={() => update("alternateGreetings", greetings.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Field label="示例对话" hint="展示角色的说话风格，多段之间用 <START> 分隔。">
          <TextArea
            value={draft.exampleDialogue}
            onChange={(v) => update("exampleDialogue", v)}
            rows={5}
            placeholder={"<START>\n{{user}}: 你好\n{{char}}: ……"}
          />
        </Field>

        <button
          className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          进阶设置
        </button>

        {showAdvanced && (
          <div className="space-y-5">
            <Field label="系统提示词" hint="角色扮演模式下替换默认的扮演指令；留空使用默认。">
              <TextArea value={draft.systemPrompt} onChange={(v) => update("systemPrompt", v)} rows={3} />
            </Field>
            <Field label="历史后指令" hint="放在对话历史之后发送，适合强调规则。">
              <TextArea
                value={draft.postHistoryInstructions}
                onChange={(v) => update("postHistoryInstructions", v)}
                rows={3}
              />
            </Field>
            <Field label="作者备注" hint="只给自己看，不会发送给模型。">
              <TextArea value={draft.creatorNotes} onChange={(v) => update("creatorNotes", v)} rows={3} />
            </Field>
            <Field label="标签" hint="用逗号分隔。">
              <input
                className={inputClass}
                value={draft.tags.join("，")}
                onChange={(e) =>
                  update(
                    "tags",
                    e.target.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
                  )
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="作者">
                <input className={inputClass} value={draft.creator} onChange={(e) => update("creator", e.target.value)} />
              </Field>
              <Field label="版本">
                <input
                  className={inputClass}
                  value={draft.characterVersion}
                  onChange={(e) => update("characterVersion", e.target.value)}
                />
              </Field>
            </div>
            {bookEntries > 0 && (
              <p className="text-xs text-muted-foreground">
                这张角色卡自带世界书（{bookEntries} 条），已原样保留，世界书功能上线后即可使用。
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-5">
          <Button variant="outline" size="sm" onClick={() => handleExport("png")}>
            <Download className="h-4 w-4 mr-1" />
            导出 PNG
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
            <Download className="h-4 w-4 mr-1" />
            导出 JSON
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            删除角色
          </Button>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}
