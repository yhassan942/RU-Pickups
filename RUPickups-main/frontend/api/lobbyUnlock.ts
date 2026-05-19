/**
 * Client-side storage helpers for per-lobby private unlock tokens.
 */
import { Platform } from 'react-native'

const inMemoryUnlockByLobby = new Map<string, string>()

export function getLobbyUnlockTokenSync(lobbyId: string): string | null {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(`lobby_unlock_${lobbyId}`)
  }
  return inMemoryUnlockByLobby.get(lobbyId) ?? null
}

export function setLobbyUnlockTokenSync(lobbyId: string, token: string): void {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(`lobby_unlock_${lobbyId}`, token)
  } else {
    inMemoryUnlockByLobby.set(lobbyId, token)
  }
}

export function clearLobbyUnlockTokenSync(lobbyId: string): void {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`lobby_unlock_${lobbyId}`)
  } else {
    inMemoryUnlockByLobby.delete(lobbyId)
  }
}
