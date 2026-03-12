import React, { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import { Save, Loader2, AlertTriangle, Columns2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useEditorStore } from "../stores/useEditorStore";

export interface MarkdownEditorProps {
  initialContent: string;
  dirtyBaselineContent?: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  onContentChange?: (content: string) => void;
  isSaving: boolean;
  isDirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  externalChangeDetected: boolean;
  onReload: () => void;
  onDismissExternalChange: () => void;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  initialContent,
  dirtyBaselineContent = initialContent,
  onSave,
  onClose,
  onContentChange,
  isSaving,
  isDirty,
  onDirtyChange,
  externalChangeDetected,
  onReload,
  onDismissExternalChange,
}) => {
  const splitPreview = useEditorStore((state) => state.splitPreview);
  const setSplitPreview = useEditorStore((state) => state.setSplitPreview);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dirtyBaselineRef = useRef(dirtyBaselineContent);
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onContentChangeRef = useRef(onContentChange);

  useEffect(() => {
    dirtyBaselineRef.current = dirtyBaselineContent;
  }, [dirtyBaselineContent]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  const getContent = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? initialContent;
  }, [initialContent]);

  const handleSave = useCallback(async () => {
    const content = getContent();
    await onSaveRef.current(content);
  }, [getContent]);

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          handleSave();
          return true;
        },
      },
      {
        key: "Escape",
        run: () => {
          onCloseRef.current();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        onDirtyChangeRef.current(content !== dirtyBaselineRef.current);
        onContentChangeRef.current?.(content);
      }
    });

    const extensions = [
      lineNumbers(),
      history(),
      bracketMatching(),
      highlightActiveLine(),
      markdown({ codeLanguages: languages }),
      saveKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      updateListener,
      EditorView.lineWrapping,
      ...(isDark
        ? [oneDark]
        : [syntaxHighlighting(defaultHighlightStyle)]),
    ];

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only re-create the editor when the component mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="font-medium">Editing</span>
          {isDirty && (
            <span className="text-amber-500 dark:text-amber-400 text-xs">
              (unsaved changes)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSplitPreview(!splitPreview)}
            aria-pressed={splitPreview}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
              splitPreview
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
            title={splitPreview ? "Hide live split preview" : "Show live split preview"}
          >
            <Columns2 size={14} />
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* External change notification */}
      {externalChangeDetected && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle size={14} />
            <span>File changed on disk.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReload}
              className="px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 rounded hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
            >
              Reload
            </button>
            <button
              onClick={onDismissExternalChange}
              className="px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* CodeMirror container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
      />
    </div>
  );
};
