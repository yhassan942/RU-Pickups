/**
 * Support contact form and outreach pathways for users needing assistance.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const palette = {
  page: '#CC0033',
  card: '#FFFFFF',
  softCard: '#FFF8F8',
  border: '#E9CFCF',
  accent: '#CC0033',
  accentDark: '#AA0029',
  text: '#3A2020',
  muted: '#7A5B5B',
  inputBg: '#FFFDFD',
};

// ─── constants ────────────────────────────────────────────────────────────────
const MESSAGE_MAX = 600;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── helpers ──────────────────────────────────────────────────────────────────
function validateFields(
  firstName: string,
  lastName: string,
  email: string,
  message: string,
) {
  return {
    firstName: firstName.trim() ? '' : 'First Name is required',
    lastName: lastName.trim() ? '' : 'Last Name is required',
    email: !email.trim()
      ? 'Email is required'
      : !EMAIL_REGEX.test(email.trim())
      ? 'Please enter a valid email address'
      : '',
    message: message.trim() ? '' : 'Message is required',
  };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ContactUsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const topInsetPadding = Math.max(insets.top + (Platform.OS === 'android' ? 18 : 0), 0);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    email: '',
    message: '',
  });

  // Refs for keyboard "next" chaining
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const messageRef = useRef<TextInput>(null);

  const clearError = (field: keyof typeof errors) =>
    setErrors((prev) => ({ ...prev, [field]: '' }));

  const isFormValid = useMemo(
    () =>
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      EMAIL_REGEX.test(email.trim()) &&
      message.trim().length > 0,
    [firstName, lastName, email, message],
  );

  const handleSubmit = async () => {
    const newErrors = validateFields(firstName, lastName, email, message);
    setErrors(newErrors);
    if (Object.values(newErrors).some(Boolean)) return;

    setLoading(true);
    try {
      // Replace with your real API call
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Reset form on success
      setFirstName('');
      setLastName('');
      setEmail('');
      setMessage('');
      setErrors({ firstName: '', lastName: '', email: '', message: '' });

      Alert.alert(
        'Message sent!',
        'Your message has been sent to support@rupickups.com. Our team will get back to you soon.',
      );
    } catch {
      Alert.alert('Something went wrong', 'Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        // 'height' works reliably on Android; 'padding' on iOS
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: topInsetPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.page, isWide && styles.pageWide]}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <MaterialIcons name="arrow-back" size={18} color={palette.accentDark} />
            </Pressable>

            <View style={styles.card}>
              <View style={[styles.content, isWide && styles.contentWide]}>
                {/* ── Left info panel ────────────────────────────────────── */}
                <View style={[styles.leftPanel, isWide && styles.leftPanelWide]}>
                  <View style={styles.sectionAccentRow}>
                    <View style={styles.sectionAccentLine} />
                    <View style={styles.sectionAccentDot} />
                  </View>

                  <View style={styles.iconBadge}>
                    <MaterialIcons name="mail-outline" size={18} color={palette.accent} />
                  </View>

                  <Text style={styles.heading}>Get in Touch</Text>
                  <Text style={styles.subheading}>We&apos;d love to hear from you.</Text>

                  <Text style={styles.bodyText}>
                    Have a question about a lobby, your account, or how RUPickups works? Send us a
                    message and we&apos;ll point you in the right direction.
                  </Text>

                  <View style={styles.infoCard}>
                    <View style={styles.infoItem}>
                      <MaterialIcons name="support-agent" size={18} color={palette.accent} />
                      <View style={styles.infoTextWrap}>
                        <Text style={styles.infoLabel}>Support</Text>
                        <Text style={styles.infoValue}>Questions, bugs, and general feedback</Text>
                      </View>
                    </View>

                    <View style={styles.infoDivider} />

                    <View style={styles.infoItem}>
                      <MaterialIcons name="favorite-border" size={18} color={palette.accent} />
                      <View style={styles.infoTextWrap}>
                        <Text style={styles.infoLabel}>Built for players</Text>
                        <Text style={styles.infoValue}>Simple, clean, and easy to use on mobile</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* ── Right form panel ───────────────────────────────────── */}
                <View style={[styles.rightPanel, isWide && styles.rightPanelWide]}>
                  <View style={styles.formHeaderRow}>
                    <View style={styles.sectionAccentLine} />
                    <View style={styles.sectionAccentDot} />
                  </View>

                  {/* Name row */}
                  <View style={styles.nameRow}>
                    <View style={styles.halfField}>
                      <Label text="First Name" />
                      {errors.firstName ? (
                        <Text style={styles.errorText} accessibilityLiveRegion="polite">
                          {errors.firstName}
                        </Text>
                      ) : null}
                      <TextInput
                        value={firstName}
                        onChangeText={(t) => { setFirstName(t); clearError('firstName'); }}
                        placeholder="Rachit"
                        placeholderTextColor="#A98A8A"
                        autoComplete="given-name"
                        autoCapitalize="words"
                        returnKeyType="next"
                        onSubmitEditing={() => lastNameRef.current?.focus()}
                        blurOnSubmit={false}
                        accessibilityLabel="First name"
                        style={[styles.input, errors.firstName ? styles.inputError : null]}
                      />
                    </View>

                    <View style={styles.halfField}>
                      <Label text="Last Name" />
                      {errors.lastName ? (
                        <Text style={styles.errorText} accessibilityLiveRegion="polite">
                          {errors.lastName}
                        </Text>
                      ) : null}
                      <TextInput
                        ref={lastNameRef}
                        value={lastName}
                        onChangeText={(t) => { setLastName(t); clearError('lastName'); }}
                        placeholder="Gupta"
                        placeholderTextColor="#A98A8A"
                        autoComplete="family-name"
                        autoCapitalize="words"
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                        blurOnSubmit={false}
                        accessibilityLabel="Last name"
                        style={[styles.input, errors.lastName ? styles.inputError : null]}
                      />
                    </View>
                  </View>

                  {/* Email */}
                  <View style={styles.fieldGroup}>
                    <Label text="Email" />
                    {errors.email ? (
                      <Text style={styles.errorText} accessibilityLiveRegion="polite">
                        {errors.email}
                      </Text>
                    ) : null}
                    <TextInput
                      ref={emailRef}
                      value={email}
                      onChangeText={(t) => { setEmail(t); clearError('email'); }}
                      placeholder="name@example.com"
                      placeholderTextColor="#A98A8A"
                      keyboardType="email-address"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      onSubmitEditing={() => messageRef.current?.focus()}
                      blurOnSubmit={false}
                      accessibilityLabel="Email address"
                      style={[styles.input, errors.email ? styles.inputError : null]}
                    />
                  </View>

                  {/* Message */}
                  <View style={styles.fieldGroup}>
                    <View style={styles.messageLabelRow}>
                      <Label text="Message" />
                      {/* ✅ Character counter */}
                      <Text
                        style={[
                          styles.charCount,
                          message.length > MESSAGE_MAX * 0.9 && styles.charCountWarn,
                          message.length >= MESSAGE_MAX && styles.charCountError,
                        ]}
                      >
                        {message.length}/{MESSAGE_MAX}
                      </Text>
                    </View>
                    {errors.message ? (
                      <Text style={styles.errorText} accessibilityLiveRegion="polite">
                        {errors.message}
                      </Text>
                    ) : null}
                    <TextInput
                      ref={messageRef}
                      value={message}
                      onChangeText={(t) => {
                        if (t.length <= MESSAGE_MAX) {
                          setMessage(t);
                          clearError('message');
                        }
                      }}
                      placeholder="Tell us how we can help..."
                      placeholderTextColor="#A98A8A"
                      multiline
                      textAlignVertical="top"
                      returnKeyType="done"
                      blurOnSubmit
                      accessibilityLabel="Message"
                      style={[
                        styles.input,
                        styles.messageInput,
                        errors.message ? styles.inputError : null,
                      ]}
                    />
                  </View>

                  {/*disabled when form invalid */}
                  <Pressable
                    onPress={!isFormValid || loading ? undefined : handleSubmit}
                    disabled={!isFormValid || loading}
                    style={({ pressed }) => [
                      styles.sendButton,
                      (!isFormValid || loading) && styles.sendButtonDisabled,
                      pressed && isFormValid && !loading && styles.sendButtonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    accessibilityState={{ disabled: !isFormValid || loading }}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="send" size={16} color="#fff" />
                        <Text style={styles.sendButtonText}>Send</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    backgroundColor: palette.page,
  },
  scrollContent: { flexGrow: 1 },
  page: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  pageWide: {
    paddingHorizontal: 30,
    paddingVertical: 34,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 28,
    padding: 20,
    shadowColor: 'rgba(120, 22, 22, 0.12)',
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  content: { gap: 22 },
  contentWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 28,
  },
  leftPanel: {
    backgroundColor: palette.softCard,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
    padding: 22,
  },
  leftPanelWide: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 560,
  },
  rightPanel: { paddingVertical: 4 },
  rightPanelWide: {
    flex: 1,
    maxWidth: 520,
    justifyContent: 'center',
  },
  sectionAccentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionAccentLine: {
    width: 40,
    height: 2,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  sectionAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#D96E6E',
  },
  iconBadge: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFEAEA',
    borderWidth: 1,
    borderColor: '#F3CFCF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  heading: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '700',
    color: palette.accentDark,
    letterSpacing: -0.8,
  },
  subheading: {
    marginTop: 10,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: palette.text,
  },
  bodyText: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 24,
    color: palette.muted,
    maxWidth: 460,
  },
  infoCard: {
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoTextWrap: { flex: 1 },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F3DEDE',
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  // nameRow now has consistent top margin like fieldGroup
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 2,
  },
  halfField: {
    flex: 1,
    minWidth: 150,
  },
  fieldGroup: { marginTop: 16 },
  label: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
    color: palette.muted,
    letterSpacing: 0.3,
  },
  messageLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  // Character counter styles
  charCount: {
    fontSize: 11,
    color: palette.muted,
    fontWeight: '500',
  },
  charCountWarn: {
    color: '#E08A00',
  },
  charCountError: {
    color: '#D32F2F',
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8B5B5',
    backgroundColor: palette.inputBg,
    paddingHorizontal: 14,
    color: palette.text,
    fontSize: 15,
  },
  messageInput: {
    minHeight: 132,
    paddingTop: 14,
  },
  sendButton: {
    marginTop: 20,
    alignSelf: 'flex-end',
    minWidth: 126,
    height: 46,
    borderRadius: 14,
    backgroundColor: palette.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // visually disabled 
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonPressed: {
    backgroundColor: palette.accentDark,
    transform: [{ scale: 0.97 }],
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#D32F2F',
    borderWidth: 1.5,
  },
});
