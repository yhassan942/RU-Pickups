/**
 * Profile editing screen for updating user identity and preference fields.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Platform,
  View,
} from 'react-native'

import { authedFetch } from '@/api/backend'

const CAMPUS_OPTIONS = [
  'College Avenue',
  'Busch',
  'Livingston',
  'Cook/Douglass',
] as const

type CampusOption = (typeof CAMPUS_OPTIONS)[number]
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

type UserMe = {
  user_id: string
  username: string
  preferred_campus?: string | null
  phone_number?: string | null
  elo: number
  wins: number
  losses: number
}

const palette = {
  page: '#CC0033',
  card: '#FFFFFF',
  softCard: '#FFF3F7',
  border: '#F1CCD8',
  accent: '#CC0033',
  accentDark: '#AA0029',
  text: '#3B1F28',
  muted: '#7A5A65',
  chipBg: '#FFE3EB',
}

export default function EditProfileScreen() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState(false)

  const [initial, setInitial] = useState<{
    username: string
    preferredCampus: CampusOption | ''
    phoneNumber: string
  } | null>(null)

  const [username, setUsername] = useState('')
  const [preferredCampus, setPreferredCampus] = useState<CampusOption | ''>('')
  const [phoneNumber, setPhoneNumber] = useState('')

  const [usernameError, setUsernameError] = useState('')
  const [campusError, setCampusError] = useState('')
  const [phoneError, setPhoneError] = useState('')

  const loadProfile = useCallback(
    async (isActive: () => boolean) => {
      setLoading(true)
      setLoadError(null)
      setIsNotFound(false)

      try {
        const res = await authedFetch('/users/me')

        if (!res.ok) {
          if (res.status === 401) {
            router.replace('/login')
            return
          }

          if (res.status === 404) {
            if (isActive()) {
              setIsNotFound(true)
              setLoadError('No profile found yet. Please complete your profile first.')
            }
            return
          }

          throw new Error(`Failed to load profile (${res.status})`)
        }

        const data = (await res.json()) as UserMe

        const rawCampus = data.preferred_campus ?? null
        const normalizedCampus: CampusOption | '' =
          rawCampus && CAMPUS_OPTIONS.includes(rawCampus as CampusOption)
            ? (rawCampus as CampusOption)
            : ''

        const nextInitial = {
          username: data.username ?? '',
          preferredCampus: normalizedCampus,
          phoneNumber: data.phone_number ?? '',
        }

        if (!isActive()) return
        setInitial(nextInitial)
        setUsername(nextInitial.username)
        setPreferredCampus(nextInitial.preferredCampus)
        setPhoneNumber(nextInitial.phoneNumber)
      } catch (e) {
        const msg = String(e || '')
        if (msg.includes('Not authenticated')) {
          router.replace('/login')
          return
        }
        if (isActive()) setLoadError('We could not load your profile right now.')
      } finally {
        if (isActive()) setLoading(false)
      }
    },
    [router]
  )

  useEffect(() => {
    let active = true
    const isActive = () => active

    void loadProfile(isActive)

    return () => {
      active = false
    }
  }, [loadProfile])

  const isDirty = useMemo(() => {
    if (!initial) return false
    return (
      username.trim() !== initial.username.trim() ||
      preferredCampus !== initial.preferredCampus ||
      phoneNumber.trim() !== initial.phoneNumber.trim()
    )
  }, [initial, phoneNumber, preferredCampus, username])

  const validate = () => {
    const trimmedUsername = username.trim()
    const trimmedPhone = phoneNumber.trim()

    setUsernameError('')
    setCampusError('')
    setPhoneError('')

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

    return { hasError, trimmedUsername, trimmedPhone }
  }

  const handleSave = async () => {
    if (saving) return

    const { hasError, trimmedUsername, trimmedPhone } = validate()
    if (hasError) return
    if (!isDirty) {
      router.back()
      return
    }

    setSaving(true)

    try {
      const res = await authedFetch('/users/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          preferred_campus: preferredCampus,
          phone_number: trimmedPhone,
        }),
      })

      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        Alert.alert('Save failed', `Could not update your profile (${res.status}). ${msg}`)
        return
      }

      router.back()
    } catch {
      Alert.alert('Save failed', 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (!isDirty) {
      router.back()
      return
    }

    if (Platform.OS === 'web') {
      router.back()
      return
    }

    Alert.alert('Discard changes?', 'You have unsaved updates to your profile.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ])
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.page}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={handleCancel}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <MaterialIcons name="close" size={18} color={palette.accentDark} />
            </Pressable>

            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Edit Profile</Text>
              <Text style={styles.subtitle}>Update your account details.</Text>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={saving || loading}
              style={({ pressed }) => [
                styles.saveButton,
                (saving || loading) && styles.saveButtonDisabled,
                pressed && !(saving || loading) && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: saving || loading }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={palette.accent} />
              <Text style={styles.stateText}>Loading your profile...</Text>
            </View>
          ) : loadError ? (
            <View style={styles.stateCard}>
              <View style={styles.errorIconWrap}>
                <MaterialIcons name="error-outline" size={22} color={palette.accent} />
              </View>
              <Text style={styles.stateTitle}>Unable to edit profile</Text>
              <Text style={styles.stateText}>{loadError}</Text>
              {isNotFound ? (
                <Pressable
                  onPress={() => router.replace('/complete-profile')}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Go to complete profile"
                >
                  <Text style={styles.primaryButtonText}>Complete Profile</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    const isActive = () => true
                    void loadProfile(isActive)
                  }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading profile"
                >
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Account information</Text>

              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                placeholderTextColor="#8C6B76"
                style={[styles.input, usernameError && styles.inputError]}
                autoCapitalize="none"
                maxLength={MAX_USERNAME_LENGTH}
                accessibilityLabel="Username"
              />
              {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}

              <Text style={styles.label}>Preferred campus</Text>
              <View style={styles.campusWrap}>
                {CAMPUS_OPTIONS.map((campus) => {
                  const selected = preferredCampus === campus
                  return (
                    <Pressable
                      key={campus}
                      onPress={() => setPreferredCampus(campus)}
                      style={({ pressed }) => [
                        styles.campusPill,
                        selected && styles.campusPillSelected,
                        pressed && styles.buttonPressedSoft,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Preferred campus ${campus}`}
                    >
                      <Text style={[styles.campusPillText, selected && styles.campusPillTextSelected]}>
                        {campus}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              {campusError ? <Text style={styles.errorText}>{campusError}</Text> : null}

              <Text style={styles.label}>Phone number (optional)</Text>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Phone number"
                placeholderTextColor="#8C6B76"
                style={[styles.input, phoneError && styles.inputError]}
                keyboardType="phone-pad"
                maxLength={MAX_PHONE_NUMBER_LENGTH}
                accessibilityLabel="Phone number"
              />
              {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

              <View style={styles.helperRow}>
                <MaterialIcons name="info-outline" size={16} color={palette.muted} />
                <Text style={styles.helperText}>
                  Changes are saved to your account and will appear on your profile.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.page,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.accentDark,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: palette.muted,
    fontWeight: '600',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: palette.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonPressedSoft: {
    opacity: 0.92,
  },
  stateCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 220,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.text,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
    textAlign: 'center',
  },
  errorIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.chipBg,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.muted,
    marginTop: 8,
  },
  input: {
    backgroundColor: palette.softCard,
    color: palette.text,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#F5D8E1',
    marginTop: 6,
  },
  inputError: {
    borderColor: '#DC2626',
  },
  errorText: {
    marginTop: 6,
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  campusWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  campusPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#fff',
  },
  campusPillSelected: {
    borderColor: palette.accent,
    backgroundColor: 'rgba(204, 0, 51, 0.10)',
  },
  campusPillText: {
    fontSize: 14,
    color: palette.text,
    fontWeight: '700',
  },
  campusPillTextSelected: {
    color: palette.accentDark,
  },
  helperRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  helperText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
    fontWeight: '600',
  },
})

