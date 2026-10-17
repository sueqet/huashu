import { useEffect, useState } from "react";
import type { CharacterCard } from "@/types";
import { characterService } from "@/services/character-service";
import { cn } from "@/lib/utils";

interface CharacterAvatarProps {
  card: Pick<CharacterCard, "id" | "name" | "avatar" | "updatedAt">;
  className?: string;
}

/** 角色头像；没有头像时显示名字首字 */
export function CharacterAvatar({ card, className }: CharacterAvatarProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (card.avatar) {
      characterService
        .readAvatarDataUrl(card as CharacterCard)
        .then((url) => !cancelled && setSrc(url));
    }
    return () => {
      cancelled = true;
    };
  }, [card.id, card.avatar, card.updatedAt]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground font-medium",
        className ?? "h-12 w-12"
      )}
    >
      {src ? (
        <img src={src} alt={card.name} className="h-full w-full object-cover" />
      ) : (
        <span>{Array.from(card.name.trim())[0] || "?"}</span>
      )}
    </div>
  );
}
