/**
 * In-app help and onboarding reference for core gameplay flows.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const palette = {
  page: '#CC0033',
  card: '#FFFFFF',
  softCard: '#FFF3F7',
  border: '#F1CCD8',
  accent: '#CC0033',
  //  now darker
  accentDark: '#AA0029',
  text: '#3B1F28',
  muted: '#7A5A65',
  chipBg: '#FFE3EB',
};

const guideSteps = [
  {
    number: '01',
    title: 'Create your account',
    description:
      'Sign up, complete your profile, and add the basic details other players need to recognize you.',
    icon: 'person-outline' as const,
  },
  {
    number: '02',
    title: 'Browse active lobbies',
    description:
      'Go to the lobbies page to see available games, locations, and pickup opportunities near you.',
    icon: 'groups-2' as const,
  },
  {
    number: '03',
    title: 'Join or create a game',
    description:
      'Join an open lobby or create your own lobby if you want to organize a new run with other players.',
    icon: 'add-circle-outline' as const,
  },
  {
    number: '04',
    title: 'Check details before you go',
    description:
      'Review the time, location, and lobby information so you know exactly where to show up and what to expect.',
    icon: 'event-note' as const,
  },
  {
    number: '05',
    title: 'Understand the ELO system',
    description:
      'Your ELO changes based on your wins and losses. Winning games can raise your rating, while losing games can lower it. This helps reflect your performance over time and gives players a competitive ranking.',
    icon: 'trending-up' as const,
  },
  {
    number: '06',
    title: 'Play and track your activity',
    description:
      'Use the app to keep up with your games, match history, and profile as the community grows.',
    icon: 'emoji-events' as const,
  },
];

//  "About ELO" card
const quickTips = [
  'Keep your profile updated so other players can identify you.',
  'Double-check the lobby location and start time before leaving.',
  'Join early when a game is filling up fast.',
  'Check your match history to track progress over time.',
  'Use Contact Us if you run into bugs or account issues.',
];

export default function UserGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 950;
  const topInsetPadding = Math.max(insets.top + (Platform.OS === 'android' ? 18 : 0), 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInsetPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.page, isWide && styles.pageWide]}>
          {/* added accessibilityRole and accessibilityLabel */}
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MaterialIcons name="arrow-back" size={18} color={palette.accentDark} />
          </Pressable>

          <View style={styles.heroCard}>
            <View style={styles.heroAccentRow}>
              <View style={styles.sectionAccentLine} />
              {/* softened dot color to match contact screen design system */}
              <View style={styles.sectionAccentDot} />
            </View>

            <View style={styles.heroIcon}>
              <MaterialIcons name="menu-book" size={20} color={palette.accent} />
            </View>

            <Text style={styles.heroTitle}>User Guide</Text>
            <Text style={styles.heroSubtitle}>
              Everything you need to get started with RUPickups.
            </Text>
            <Text style={styles.heroBody}>
              This guide walks you through the basic flow of using the app, from setting up your
              account to joining games, understanding your ELO, and staying organized.
            </Text>
          </View>

          <View style={[styles.contentRow, isWide && styles.contentRowWide]}>
            <View style={[styles.stepsPanel, isWide && styles.stepsPanelWide]}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>How it works</Text>
                <Text style={styles.panelSubtext}>Simple steps to start using the app</Text>
              </View>

              {guideSteps.map((step, index) => (
                <View key={step.number} style={styles.stepCard}>
                  <View style={styles.stepLeft}>
                    <View style={styles.stepNumberBadge}>
                      <Text style={styles.stepNumber}>{step.number}</Text>
                    </View>

                    {index !== guideSteps.length - 1 ? (
                      <View style={styles.stepConnector} />
                    ) : null}
                  </View>

                  <View style={styles.stepContent}>
                    <View style={styles.stepIconRow}>
                      <View style={styles.smallIconBadge}>
                        <MaterialIcons name={step.icon} size={18} color={palette.accent} />
                      </View>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                    </View>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.sidePanel, isWide && styles.sidePanelWide]}>
              <View style={styles.sideCard}>
                <Text style={styles.sideCardTitle}>Quick Tips</Text>
                <View style={styles.tipList}>
                  {quickTips.map((tip) => (
                    <View key={tip} style={styles.tipItem}>
                      <View style={styles.tipDot} />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.sideCard}>
                <Text style={styles.sideCardTitle}>About ELO</Text>
                <Text style={styles.sideCardBody}>
                  ELO is your skill rating in the app. Your rating changes based on match results,
                  so wins generally increase your ELO and losses generally decrease it. Over time,
                  this helps show your performance level compared with other players.
                </Text>
              </View>

              <View style={styles.sideCard}>
                <Text style={styles.sideCardTitle}>Need help?</Text>
                <Text style={styles.sideCardBody}>
                  If something is not working the way you expect, head to the Contact Us page and
                  send a message to the team.
                </Text>

                {/* added pressed feedback, accessibilityRole, accessibilityLabel */}
                <Pressable
                  onPress={() => router.push('/contact-us')}
                  style={({ pressed }) => [
                    styles.helpButton,
                    pressed && styles.helpButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Contact Us page"
                >
                  <MaterialIcons name="mail-outline" size={16} color="#fff" />
                  <Text style={styles.helpButtonText}>Go to Contact Us</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  pageWide: {
    paddingHorizontal: 30,
    paddingVertical: 34,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: palette.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 22,
    shadowColor: 'rgba(204, 0, 51, 0.10)',
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroAccentRow: {
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
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: palette.chipBg,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '700',
    color: palette.accentDark,
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: palette.text,
  },
  heroBody: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 24,
    color: palette.muted,
    maxWidth: 720,
  },
  contentRow: {
    gap: 18,
  },
  contentRowWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepsPanel: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
  },
  stepsPanelWide: {
    flex: 1.35,
  },
  sidePanel: {
    gap: 18,
  },
  sidePanelWide: {
    flex: 0.9,
  },
  panelHeader: {
    marginBottom: 18,
  },
  panelTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.text,
  },
  panelSubtext: {
    marginTop: 6,
    fontSize: 14,
    color: palette.muted,
  },
  stepCard: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 10,
  },
  stepLeft: {
    alignItems: 'center',
  },
  stepNumberBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.chipBg,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: palette.accentDark,
    fontWeight: '700',
    fontSize: 12,
  },
  stepConnector: {
    width: 2,
    flex: 1,
    backgroundColor: '#F3D3DD',
    marginTop: 8,
    minHeight: 34,
  },
  stepContent: {
    flex: 1,
    backgroundColor: palette.softCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F5D8E1',
    padding: 16,
  },
  stepIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  smallIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  sideCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
  },
  sideCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 12,
  },
  sideCardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  tipList: {
    gap: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.accent,
    marginTop: 7,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  helpButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 14,
    backgroundColor: palette.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // pressed feedback 
  helpButtonPressed: {
    backgroundColor: palette.accentDark,
    transform: [{ scale: 0.97 }],
  },
  helpButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
