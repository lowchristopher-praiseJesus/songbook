import { create } from 'zustand'

export const useSessionStore = create((set, get) => ({
  // Session identity
  code: null,
  leaderToken: null,        // only present for the worship leader
  // Synced state from Worker
  name: '',
  version: -1,
  setList: [],              // ordered array of songIds
  songs: {},                // Record<songId, { meta, rawText }>
  editLocks: {},            // Record<songId, { clientId, expiresAt }>
  closed: false,
  expiresAt: null,
  // Local client identity
  clientId: null,           // UUID for this tab, used for lock ownership

  initClient(code, leaderToken) {
    // Generate or restore clientId from sessionStorage so refresh keeps the lock
    let clientId = sessionStorage.getItem('session_client_id')
    if (!clientId) {
      clientId = crypto.randomUUID()
      sessionStorage.setItem('session_client_id', clientId)
    }
    set({ code, leaderToken: leaderToken ?? null, clientId })
  },

  applyServerState(state) {
    set({
      name: state.name,
      version: state.version,
      setList: state.setList,
      songs: state.songs,
      editLocks: state.editLocks,
      closed: state.closed,
      expiresAt: state.expiresAt,
    })
  },

  clearSession() {
    sessionStorage.removeItem('session_client_id')
    set({
      code: null, leaderToken: null, name: '', version: -1,
      setList: [], songs: {}, editLocks: {}, closed: false,
      expiresAt: null, clientId: null,
    })
  },

  isLeader() {
    return !!get().leaderToken
  },

  isLocked(songId) {
    const lock = get().editLocks[songId]
    if (!lock) return false
    return new Date(lock.expiresAt).getTime() > Date.now()
  },

  isMyLock(songId) {
    const lock = get().editLocks[songId]
    if (!lock) return false
    return lock.clientId === get().clientId && new Date(lock.expiresAt).getTime() > Date.now()
  },
}))
