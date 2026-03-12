import { create } from "zustand";
import axios from "axios";
import { useRepoStore } from "./useRepoStore";

const getApiBase = (): string | null => {
  const { currentRepo, isMultiRepo } = useRepoStore.getState();
  if (isMultiRepo) {
    if (!currentRepo) return null;
    return `/api/r/${encodeURIComponent(currentRepo)}`;
  }
  return "/api";
};

interface EditorState {
  isEditing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  lastSaveTimestamp: number;
  externalChangeDetected: boolean;
  splitPreview: boolean;

  enterEditMode: () => void;
  exitEditMode: () => void;
  setDirty: (dirty: boolean) => void;
  setExternalChangeDetected: (detected: boolean) => void;
  setSplitPreview: (splitPreview: boolean) => void;
  saveFile: (path: string, content: string) => Promise<boolean>;
}

export const useEditorStore = create<EditorState>((set) => ({
  isEditing: false,
  isDirty: false,
  isSaving: false,
  lastSaveTimestamp: 0,
  externalChangeDetected: false,
  splitPreview: (() => {
    try {
      return localStorage.getItem("vantage:splitPreview") === "true";
    } catch {
      return false;
    }
  })(),

  enterEditMode: () =>
    set({
      isEditing: true,
      isDirty: false,
      lastSaveTimestamp: 0,
      externalChangeDetected: false,
    }),

  exitEditMode: () =>
    set({
      isEditing: false,
      isDirty: false,
      isSaving: false,
      lastSaveTimestamp: 0,
      externalChangeDetected: false,
    }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  setExternalChangeDetected: (detected) =>
    set({ externalChangeDetected: detected }),

  setSplitPreview: (splitPreview) => {
    try {
      localStorage.setItem("vantage:splitPreview", String(splitPreview));
    } catch {
      /* ignore */
    }
    set({ splitPreview });
  },

  saveFile: async (path: string, content: string) => {
    const apiBase = getApiBase();
    if (!apiBase) return false;

    set({ isSaving: true });
    try {
      await axios.put(`${apiBase}/content`, { content }, { params: { path } });
      set({
        isSaving: false,
        isDirty: false,
        lastSaveTimestamp: Date.now(),
        externalChangeDetected: false,
      });
      return true;
    } catch (err) {
      set({ isSaving: false });
      console.error("[editor] Save failed:", err);
      return false;
    }
  },
}));
