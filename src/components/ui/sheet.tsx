import { useCallback, useEffect, useRef, useState } from "react";
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
  resizable?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
}

/**
 * 从右侧滑入的侧边栏 Sheet 组件
 */
export function Sheet({
  open,
  onOpenChange,
  size = "md",
  title,
  resizable = false,
  defaultWidth,
  minWidth = 320,
  maxWidth = 900,
  children,
}: SheetProps) {
  const [width, setWidth] = useState(defaultWidth || 0);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (defaultWidth) setWidth(defaultWidth);
  }, [defaultWidth]);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizable) return;
    dragStartRef.current = { x: event.clientX, width: width || defaultWidth || minWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [defaultWidth, minWidth, resizable, width]);

  const handleResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const nextWidth = dragStartRef.current.width + dragStartRef.current.x - event.clientX;
    setWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
  }, [maxWidth, minWidth]);

  const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const widthStyle = resizable && width ? { width } : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`fixed inset-y-0 right-0 z-50 ${resizable ? "" : SIZE_CLASS[size]} bg-background border-l shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200 flex flex-col`}
          style={widthStyle}
        >
          {resizable && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="absolute left-[-3px] top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
          )}
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
