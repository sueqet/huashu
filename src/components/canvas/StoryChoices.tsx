import { parseChoices } from "@/services/story-service";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface StoryChoicesProps {
  /** AI 回复的完整文本 */
  content: string;
  /** 是否正在生成中（生成中不显示选项） */
  isStreaming: boolean;
  /** 选择某个选项 */
  onSelectChoice: (text: string) => void;
}

export function StoryChoices({ content, isStreaming, onSelectChoice }: StoryChoicesProps) {
  if (isStreaming) return null;

  const choices = parseChoices(content);
  if (choices.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-green-200">
      {choices.map((choice) => (
        <Button
          key={choice.index}
          variant="outline"
          size="sm"
          className="text-left h-auto py-2 px-3 whitespace-normal hover:bg-green-50 hover:border-green-300"
          onClick={() => onSelectChoice(choice.text)}
        >
          <ChevronRight className="h-3 w-3 mr-1 shrink-0 text-green-600" />
          <span className="text-sm">{choice.text}</span>
        </Button>
      ))}
    </div>
  );
}
