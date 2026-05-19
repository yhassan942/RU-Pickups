/**
 * First-run profile completion flow after authentication succeeds.
 */
import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/api/supabase'
import { API_BASE_URL } from '@/api/backend'

const CAMPUS_OPTIONS = [
  'College Avenue',
  'Busch',
  'Livingston',
  'Cook/Douglass',
] as const
const MAX_USERNAME_LENGTH = 30
const MAX_PHONE_NUMBER_LENGTH = 20

const containsEmoji = (value: string) => {
  for (const char of value) {
    const codepoint = char.codePointAt(0) ?? 0
    if (
      (codepoint >= 0x1f300 && codepoint <= 0x1faff) ||
      (codepoint >= 0x1f1e6 && codepoint <= 0x1f1ff) ||
      (codepoint >= 0x2600 && codepoint <= 0x27bf) ||
      codepoint === 0x200d ||
      codepoint === 0xfe0f ||
      codepoint === 0x20e3
    ) {
      return true
    }
  }
  return false
}

export default function CompleteProfile() {
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [preferredCampus, setPreferredCampus] = useState<string>('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [usernameError, setUsernameError] = useState('')
  const [campusError, setCampusError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [globalError, setGlobalError] = useState('')
  const [globalSuccess, setGlobalSuccess] = useState('')

  const handleCompleteProfile = async () => {
    const trimmedUsername = username.trim()
    const trimmedPhone = phoneNumber.trim()

    setUsernameError('')
    setCampusError('')
    setPhoneError('')
    setGlobalError('')
    setGlobalSuccess('')

    let hasError = false

    if (!trimmedUsername) {
      setUsernameError('Please enter a username.')
      hasError = true
    } else if (trimmedUsername.length > MAX_USERNAME_LENGTH) {
      setUsernameError(`Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`)
      hasError = true
    } else if (containsEmoji(trimmedUsername)) {
      setUsernameError('Username cannot contain emojis.')
      hasError = true
    }

    if (!preferredCampus) {
      setCampusError('Please select a preferred campus.')
      hasError = true
    }

    if (trimmedPhone) {
      let phoneFieldHasError = false
      if (trimmedPhone.length > MAX_PHONE_NUMBER_LENGTH) {
        setPhoneError(`Phone number must be ${MAX_PHONE_NUMBER_LENGTH} characters or fewer.`)
        hasError = true
        phoneFieldHasError = true
      } else if (containsEmoji(trimmedPhone)) {
        setPhoneError('Phone number cannot contain emojis.')
        hasError = true
        phoneFieldHasError = true
      }

      if (!phoneFieldHasError) {
        const digits = trimmedPhone.replace(/\D/g, '')
        if (digits.length < 10) {
          setPhoneError('Please enter a valid phone number (at least 10 digits).')
          hasError = true
        }
      }
    }

    if (hasError) return
    if (submitting) return

    setSubmitting(true)

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        setGlobalError(sessionError.message)
        return
      }

      const token = session?.access_token
      if (!token) {
        setGlobalError('You must be logged in to complete your profile.')
        return
      }

      const res = await fetch(`${API_BASE_URL}/users/me`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: trimmedUsername,
          preferred_campus: preferredCampus,
          phone_number: trimmedPhone || null,
        }),
      })

    if (!res.ok) {
    const msg = await res.text().catch(() => '')
    setGlobalError(`Profile setup failed (${res.status}). ${msg}`)
    return
    }

      router.replace('/(tabs)/lobbies')
    } catch {
      setGlobalError('Profile setup failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.background}>
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.subtitle}>
              Add a few details so we can personalize your experience.
            </Text>

            {globalError ? <Text style={styles.errorText}>{globalError}</Text> : null}
            {globalSuccess ? (
              <Text style={styles.successText}>{globalSuccess}</Text>
            ) : null}

            <TextInput
              placeholder="Username"
              placeholderTextColor="#64748b"
              value={username}
              onChangeText={setUsername}
              style={[styles.input, usernameError && styles.inputError]}
              autoCapitalize="none"
              maxLength={MAX_USERNAME_LENGTH}
            />
            {usernameError ? (
              <Text style={styles.errorText}>{usernameError}</Text>
            ) : null}

            <Text style={styles.label}>Preferred campus</Text>

            <View style={styles.campusWrap}>
              {CAMPUS_OPTIONS.map((campus) => {
                const selected = preferredCampus === campus
                return (
                  <TouchableOpacity
                    key={campus}
                    onPress={() => setPreferredCampus(campus)}
                    activeOpacity={0.85}
                    style={[styles.campusPill, selected && styles.campusPillSelected]}
                  >
                    <Text
                      style={[
                        styles.campusPillText,
                        selected && styles.campusPillTextSelected,
                      ]}
                    >
                      {campus}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {campusError ? (
              <Text style={styles.errorText}>{campusError}</Text>
            ) : null}

            <TextInput
              placeholder="Phone number"
              placeholderTextColor="#64748b"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              style={[styles.input, phoneError && styles.inputError]}
              keyboardType="phone-pad"
              maxLength={MAX_PHONE_NUMBER_LENGTH}
            />
            {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleCompleteProfile}
              disabled={submitting}
              activeOpacity={0.9}
            >
              <Text style={styles.buttonText}>
                {submitting ? 'Saving...' : 'Finish setup'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  label: {
    color: '#374151',
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '500',
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
  successText: {
    color: '#16a34a',
    fontSize: 13,
    marginBottom: 8,
  },
  campusWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  campusPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  campusPillSelected: {
    borderColor: '#CC0033',
    backgroundColor: 'rgba(204, 0, 51, 0.10)',
  },
  campusPillText: {
    fontSize: 14,
    color: '#0f172a',
  },
  campusPillTextSelected: {
    color: '#CC0033',
    fontWeight: '700',
  },
})