import { create } from "zustand";

/**
 * Cross-cutting UI toggles that live outside any single screen — e.g. the
 * Settings modal, which can be opened both from the persistent gear icon
 * (AudioControls) and from contextual prompts like the LLM setup banner.
 */
interface UIState {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
