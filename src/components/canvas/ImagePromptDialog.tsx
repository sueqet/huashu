import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ImagePromptDialogProps {
  open: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isGenerating?: boolean;
}

export function ImagePromptDialog({
  open,
  prompt,
  onPromptChange,
  onCancel,
  onConfirm,
  isGenerating = false,
}: ImagePromptDialogProps) {
  const trimmedPrompt = prompt.trim();

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm image prompt</DialogTitle>
          <DialogDescription>
            Review or edit the prompt before generating the image.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          className="min-h-[220px] resize-y"
          disabled={isGenerating}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isGenerating || !trimmedPrompt}>
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
