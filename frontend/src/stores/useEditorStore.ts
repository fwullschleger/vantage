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

  enterEditMode: () => void;
  exitEditMode: () => void;
  setDirty: (dirty: boolean) => void;
  setExternalChangeDetected: (detected: boolean) => void;
  saveFile: (path: string, content: string) => Promise<boolean>;
}

export const useEditorStore = create<EditorState>((set) => ({
  isEditing: false,
  isDirty: false,
  isSaving: false,
  lastSaveTimestamp: 0,
  externalChangeDetected: false,

  enterEditMode: () =>
    set({ isEditing: true, isDirty: false, externalChangeDetected: false }),

  exitEditMode: () =>
    set({
      isEditing: false,
      isDirty: false,
      isSaving: false,
      externalChangeDetected: false,
    }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  setExternalChangeDetected: (detected) =>
    set({ externalChangeDetected: detected }),

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
