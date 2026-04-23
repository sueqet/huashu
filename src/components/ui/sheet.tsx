import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

type SheetSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<SheetSize, string> = {
  sm: "w-[300px]",
  md: "w-[450px]",
  lg: "w-[600px]",
};

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: SheetSize;
  title?: string;
  children: React.ReactNode;
}

/**
 * 从右侧滑入的侧边栏 Sheet 组件
 */
export function Sheet({ open, onOpenChange, size = "md", title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`fixed inset-y-0 right-0 z-50 ${SIZE_CLASS[size]} bg-background border-l shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200 flex flex-col`}
        >
          {title && (
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <Dialog.Title className="text-sm font-semibold">
                {title}
              </Dialog.Title>
              <Dialog.Close className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
