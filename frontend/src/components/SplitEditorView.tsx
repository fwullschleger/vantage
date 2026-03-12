import React, { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor, type MarkdownEditorProps } from "./MarkdownEditor";
import { MarkdownViewer } from "./MarkdownViewer";
import { cn } from "../lib/utils";

interface SplitEditorViewProps extends MarkdownEditorProps {
  currentPath: string;
}

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const PREVIEW_DEBOUNCE_MS = 200;

const clampRatio = (ratio: number): number =>
  Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));

export const SplitEditorView: React.FC<SplitEditorViewProps> = ({
  initialContent,
  onContentChange,
  currentPath,
  ...editorProps
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [previewContent, setPreviewContent] = useState(initialContent);
  const [isStacked, setIsStacked] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsStacked(event.matches);
    };

    setIsStacked(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  useEffect(
    () => () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    },
    [],
  );

  const updateSplitRatio = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const size = isStacked ? rect.height : rect.width;
      if (size <= 0) return;

      const offset = isStacked ? clientY - rect.top : clientX - rect.left;
      setSplitRatio(clampRatio(offset / size));
    },
    [isStacked],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      onContentChange?.(content);

      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }

      previewTimerRef.current = window.setTimeout(() => {
        setPreviewContent(content);
      }, PREVIEW_DEBOUNCE_MS);
    },
    [onContentChange],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateSplitRatio(event.clientX, event.clientY);
    },
    [updateSplitRatio],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      updateSplitRatio(event.clientX, event.clientY);
    },
    [updateSplitRatio],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const editorPaneBasis = `calc(${splitRatio * 100}% - 2px)`;
  const previewPaneBasis = `calc(${(1 - splitRatio) * 100}% - 2px)`;

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:flex-row"
    >
      <div
        className="min-h-[20%] min-w-0 shrink-0 overflow-hidden"
        style={{ flexBasis: editorPaneBasis }}
      >
        <MarkdownEditor
          {...editorProps}
          initialContent={initialContent}
          onContentChange={handleContentChange}
        />
      </div>

      <div
        role="separator"
        aria-label="Resize editor and preview panes"
        aria-orientation={isStacked ? "horizontal" : "vertical"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "group shrink-0 touch-none bg-slate-200 transition-colors hover:bg-blue-400 dark:bg-slate-700 dark:hover:bg-blue-500",
          isStacked ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize",
        )}
      >
        <div
          className={cn(
            "mx-auto rounded-full bg-slate-400/80 transition-colors group-hover:bg-white/90 dark:bg-slate-500",
            isStacked ? "h-full w-12" : "h-12 w-full",
          )}
        />
      </div>

      <div
        className="min-h-[20%] min-w-0 shrink-0 overflow-hidden bg-slate-50 dark:bg-slate-950/40"
        style={{ flexBasis: previewPaneBasis }}
      >
        <div
          data-content-scroll
          className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        >
          <MarkdownViewer content={previewContent} currentPath={currentPath} />
        </div>
      </div>
    </div>
  );
};
