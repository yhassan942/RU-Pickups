/**
 * Shared backend networking helpers, including auth-aware fetch wrappers.
 */
import { Platform } from 'react-native'
import { getLobbyUnlockTokenSync } from '@/api/lobbyUnlock'
import { supabase } from '@/api/supabase'

const API_BASE_URL_COMMON = process.env.EXPO_PUBLIC_API_BASE_URL
const API_BASE_URL_WEB = process.env.EXPO_PUBLIC_API_BASE_URL_WEB
const API_BASE_URL_ANDROID = process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID
const API_BASE_URL_IOS = process.env.EXPO_PUBLIC_API_BASE_URL_IOS

const resolveApiBaseUrl = (): string => {
  // If a single base URL is provided, use it for all platforms
  if (API_BASE_URL_COMMON) return API_BASE_URL_COMMON

  // Otherwise prefer platform-specific overrides when available
  if (Platform.OS === 'web' && API_BASE_URL_WEB) return API_BASE_URL_WEB
  if (Platform.OS === 'android' && API_BASE_URL_ANDROID) return API_BASE_URL_ANDROID
  if (Platform.OS === 'ios' && API_BASE_URL_IOS) return API_BASE_URL_IOS

  // Sensible defaults for local dev
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000'
  return 'http://localhost:8000'
}

export const API_BASE_URL = resolveApiBaseUrl()

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data.session?.access_token ?? null
}

export async function authedFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

/** Merge lobby unlock header for private-lobby API calls when a token exists for this lobby. */
export async function authedFetchForLobby(
  lobbyId: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const unlock = getLobbyUnlockTokenSync(lobbyId)
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (unlock) headers.set('X-Lobby-Unlock', unlock)

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

