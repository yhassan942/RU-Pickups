/**
 * Email/password sign-in screen with basic client validation and profile gating.
 */
import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { supabase } from '@/api/supabase'
import { Link, useRouter } from 'expo-router'
import { API_BASE_URL } from '@/api/backend'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [globalError, setGlobalError] = useState('')

  const handleLogin = async () => {
    const trimmedEmail = email.trim()

    setEmailError('')
    setPasswordError('')
    setGlobalError('')

    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email.')
      return
    }
    if (!password) {
      setPasswordError('Please enter your password.')
      return
    }

    if (submitting) return
    setSubmitting(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          setGlobalError('Email or password is incorrect.')
        } else {
          setGlobalError(error.message)
        }
        return
      }

      const token = data.session?.access_token
      if (token) {
        const meRes = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (meRes.status === 404) {
          const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
          const metaUsername =
            typeof meta.username === 'string' ? meta.username.trim() : ''

          if (!metaUsername) {
            setGlobalError(
              'Your account is missing a username. Please sign up again.'
            )
            router.replace('/signup')
            return
          }

          const createRes = await fetch(`${API_BASE_URL}/users/me`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              username: metaUsername,
              preferred_campus:
                typeof meta.preferred_campus === 'string'
                  ? meta.preferred_campus
                  : null,
              phone_number:
                typeof meta.phone_number === 'string' ? meta.phone_number : null,
            }),
          })

          if (!createRes.ok) {
            const msg = await createRes.text()
            setGlobalError('Login succeeded, but profile setup failed.')
            return
          }
        } else if (!meRes.ok) {
          const msg = await meRes.text()
          setGlobalError('Login succeeded, but profile check failed.')
          return
        }
      }

      router.replace('/(tabs)/lobbies')
    } catch (e) {
      setGlobalError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.background}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Image
            source={require('./photos/RUPickups.png')}
            style={styles.logo}
            contentFit="contain"
          />

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to find your next game.</Text>

          {globalError ? <Text style={styles.errorText}>{globalError}</Text> : null}

          <TextInput
            placeholder="Email"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            style={[styles.input, emailError && styles.inputError]}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

          <TextInput
            placeholder="Password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={[styles.input, passwordError && styles.inputError]}
          />
          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
            activeOpacity={0.9}
          >
            <Text style={styles.buttonText}>
              {submitting ? 'LOGGING IN...' : 'Login'}
            </Text>
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account?</Text>
            <Link href="/signup" style={styles.signupLink}>
              Sign up
            </Link>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#CC0033',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#020617',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  logo: {
    width: '72%',
    height: 110,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 22,
  },
  input: {
    backgroundColor: '#f9fafb',
    color: '#020617',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  button: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  footerText: {
    color: '#6b7280',
    fontSize: 14,
  },
  signupLink: {
    marginLeft: 4,
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 14,
  },
})
