/**
 * Root app layout that wires global providers and auth/profile-based routing.
 */
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import 'react-native-reanimated'

import { API_BASE_URL } from '@/api/backend'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { supabase } from '@/api/supabase'
import type { Session } from '@supabase/supabase-js'

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const router = useRouter()
  const segments = useSegments()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    }

    getSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return

    const segment0 = segments[0]
    const inAuth = segment0 === 'login' || segment0 === 'signup'
    const inCompleteProfile = segment0 === 'complete-profile'
    const inTabs = segment0 === '(tabs)'

    const route = async () => {
      if (!session) {
        if (!inAuth) router.replace('/login')
        return
      }

      try {
        const res = await fetch(`${API_BASE_URL}/users/me`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })

        if (res.status === 401) {
          await supabase.auth.signOut()
          router.replace('/login')
          return
        }

        if (res.status === 404) {
          if (!inCompleteProfile) router.replace('/complete-profile')
          return
        }

        if (!res.ok) {
          if (!inCompleteProfile) router.replace('/complete-profile')
          return
        }

        const user = await res.json()

        const hasProfile =
          !!user?.username &&
          !!user?.preferred_campus

        if (!hasProfile) {
          if (!inCompleteProfile) router.replace('/complete-profile')
          return
        }

        if (inAuth || inCompleteProfile) {
          router.replace('/(tabs)/lobbies')
        }
      } catch {
        if (!inCompleteProfile) router.replace('/complete-profile')
      }
    }

    route()
  }, [session, segments, loading, router])
  if (loading) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="match" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}