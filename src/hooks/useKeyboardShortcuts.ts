import { useEffect, useCallback } from "react";

/**
 * 快捷键映射定义
 *
 * 全局快捷键（已在 CanvasView 中实现）：
 * - Ctrl+E: 切换编辑模式
 * - Ctrl+F: 切换搜索面板
 * - Ctrl+Z: 撤销（编辑模式）
 * - Ctrl+Y: 重做（编辑模式）
 * - Delete: 删除选中节点（编辑模式）
 */

interface ShortcutConfig {
  /** 按键（event.key） */
  key: string;
  /** 是否需要 Ctrl/Cmd */
  ctrl?: boolean;
  /** 是否需要 Shift */
  shift?: boolean;
  /** 是否需要 Alt */
  alt?: boolean;
  /** 触发回调 */
  handler: (e: KeyboardEvent) => void;
  /** 是否阻止默认行为，默认 true */
  preventDefault?: boolean;
}

/**
 * 全局键盘快捷键 Hook
 *
 * @param shortcuts 快捷键配置列表
 * @param enabled 是否启用，默认 true
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { key: 'e', ctrl: true, handler: () => toggleEditMode() },
 *   { key: 'f', ctrl: true, handler: () => toggleSearch() },
 *   { key: 'z', ctrl: true, handler: () => undo() },
 *   { key: 'y', ctrl: true, handler: () => redo() },
 *   { key: 'Delete', handler: () => deleteSelected() },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  enabled: boolean = true
): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // 忽略输入框内的快捷键
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl
          ? e.ctrlKey || e.metaKey
          : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          // 对于带修饰键的快捷键，在输入框中也要响应
          // 对于无修饰键的（如 Delete），输入框内不响应
          if (isInputFocused && !shortcut.ctrl && !shortcut.alt) {
            continue;
          }

          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.handler(e);
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}
