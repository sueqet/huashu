import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus, Upload } from "lucide-react";
import type { CharacterCard } from "@/types";
import { characterService } from "@/services/character-service";
import { Button } from "@/components/ui/button";
import { CharacterAvatar } from "./CharacterAvatar";
import { pickAndImportCharacters } from "./character-files";

interface CharacterLibraryProps {
  onEdit: (characterId: string) => void;
}

/** 角色库：浏览、新建、导入角色卡 */
export function CharacterLibrary({ onEdit }: CharacterLibraryProps) {
  const [cards, setCards] = useState<CharacterCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setCards(await characterService.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async () => {
    const card = await characterService.create();
    onEdit(card.id);
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const { imported, errors } = await pickAndImportCharacters();
      setErrors(errors);
      if (imported.length > 0) await reload();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-2xl font-semibold whitespace-nowrap">角色卡</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleImport} disabled={busy}>
            <Upload className="h-4 w-4 mr-1" />
            {busy ? "导入中..." : "导入"}
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        支持导入 SillyTavern 的 PNG / JSON 角色卡，可在多个故事中复用。
      </p>

      {errors.length > 0 && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">正在加载...</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            还没有角色卡，点击"新建"或"导入"开始
          </p>
        ) : (
          cards.map((card) => (
            <button
              key={card.id}
              className="w-full flex items-center gap-3 rounded-lg border bg-card p-3 text-left active:bg-accent"
              onClick={() => onEdit(card.id)}
            >
              <CharacterAvatar card={card} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{card.name || "未命名角色"}</div>
                <p className="text-xs text-muted-foreground truncate">
                  {card.tags.length > 0 ? card.tags.join(" · ") : card.description || "暂无描述"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
