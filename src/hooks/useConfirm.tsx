import { useState, useCallback, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
}

export function useConfirm() {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const ConfirmDialog: ReactNode = state ? (
    <AlertDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          state.resolve(false);
          setState(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.options.title}</AlertDialogTitle>
          {state.options.description && (
            <AlertDialogDescription>
              {state.options.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              state.resolve(false);
              setState(null);
            }}
          >
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              state.resolve(true);
              setState(null);
            }}
          >
            确定
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, ConfirmDialog };
}
