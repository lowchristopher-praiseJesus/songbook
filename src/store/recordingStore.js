import { create } from 'zustand'

export const useRecordingStore = create((set) => ({
  status: 'idle',
  elapsedMs: 0,
  setRecordingState: (status, elapsedMs) => set({ status, elapsedMs }),
}))
