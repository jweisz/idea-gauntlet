import { create } from "zustand";

interface AudioState {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  manualTrackId: string | null; // null = auto (per-screen)
  toggleMusic: () => void;
  toggleSfx: () => void;
  setManualTrack: (id: string | null) => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  musicEnabled: false,
  sfxEnabled: true,
  manualTrackId: null,
  toggleMusic: () => set((s) => ({ musicEnabled: !s.musicEnabled })),
  toggleSfx: () => set((s) => ({ sfxEnabled: !s.sfxEnabled })),
  setManualTrack: (id) => set({ manualTrackId: id }),
}));
