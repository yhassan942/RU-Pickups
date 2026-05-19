/**
 * Public-facing player profile screen reached from leaderboard and lobby contexts.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { authedFetch } from '@/api/backend';
import { InfoRow, profilePalette } from '@/components/profile/profile-ui';

type User = {
  user_id: string;
  username: string;
  preferred_campus?: string | null;
  elo: number;
  wins: number;
  losses: number;
};

const palette = profilePalette;

export default function PlayerProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 950;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(
    async (isActive: () => boolean) => {
      if (!userId) {
        setError('Missing player ID.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setIsNotFound(false);

      try {
        const [meRes, targetRes] = await Promise.all([
          authedFetch('/users/me'),
          authedFetch(`/users/${userId}`),
        ]);

        if (meRes.status === 401 || targetRes.status === 401) {
          router.replace('/login');
          return;
        }

        if (!meRes.ok) {
          throw new Error(`Failed to load current user (${meRes.status})`);
        }

        const me = (await meRes.json()) as { user_id: string };
        if (me.user_id === userId) {
          router.replace('/view-profile');
          return;
        }

        if (!targetRes.ok) {
          if (targetRes.status === 404) {
            if (isActive()) {
              setIsNotFound(true);
              setError('Player not found.');
            }
            return;
          }
          throw new Error(`Failed to load player profile (${targetRes.status})`);
        }

        const data = (await targetRes.json()) as User;
        if (isActive()) setUser(data);
      } catch (e) {
        const msg = String(e || '');
        if (msg.includes('Not authenticated')) {
          router.replace('/login');
          return;
        }
        if (isActive()) {
          setError('We could not load this player profile right now.');
        }
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [router, userId]
  );

  useEffect(() => {
    mountedRef.current = true;
    const isActive = () => mountedRef.current;

    void loadProfile(isActive);

    return () => {
      mountedRef.current = false;
    };
  }, [loadProfile]);

  const winRate = useMemo(() => {
    if (!user) return '—';
    const total = user.wins + user.losses;
    if (total === 0) return 'No games yet';
    return `${Math.round((user.wins / total) * 100)}%`;
  }, [user]);

  const totalGames = useMemo(() => {
    if (!user) return 0;
    return user.wins + user.losses;
  }, [user]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
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

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <MaterialIcons name="person-outline" size={20} color={palette.accent} />
            </View>
            <Text style={styles.heroTitle}>Player Profile</Text>
            <Text style={styles.heroSubtitle}>
              View this player's account details and performance summary.
            </Text>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={palette.accent} />
              <Text style={styles.stateText}>Loading player profile...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <View style={styles.errorIconWrap}>
                <MaterialIcons name="error-outline" size={22} color={palette.accent} />
              </View>
              <Text style={styles.stateTitle}>
                {isNotFound ? 'Player not found' : 'Something went wrong'}
              </Text>
              <Text style={styles.stateText}>{error}</Text>
              <View style={styles.stateActions}>
                <Pressable
                  onPress={() => router.back()}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const isActive = () => mountedRef.current;
                    void loadProfile(isActive);
                  }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </Pressable>
              </View>
            </View>
          ) : user ? (
            <View style={[styles.contentRow, isWide && styles.contentRowWide]}>
              <View style={[styles.mainPanel, isWide && styles.mainPanelWide]}>
                <View style={styles.profileCard}>
                  <View style={styles.profileHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {user.username?.trim()?.charAt(0)?.toUpperCase() || 'U'}
                      </Text>
                    </View>
                    <View style={styles.profileHeaderText}>
                      <Text style={styles.username}>{user.username}</Text>
                      <Text style={styles.userSubtext}>RUPickups player profile</Text>
                    </View>
                  </View>

                  <View style={styles.profileDetailsCard}>
                    <Text style={styles.sectionTitle}>Account Information</Text>
                    <InfoRow
                      label="Username"
                      value={user.username || '—'}
                      icon="badge"
                      styles={styles}
                    />
                    <InfoRow
                      label="Preferred Campus"
                      value={user.preferred_campus ?? 'Not set'}
                      icon="location-city"
                      styles={styles}
                    />
                  </View>

                  <View style={styles.profileDetailsCard}>
                    <Text style={styles.sectionTitle}>Performance</Text>
                    <View style={styles.statGrid}>
                      <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{user.elo}</Text>
                        <Text style={styles.statLabel}>Current ELO</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{user.wins}</Text>
                        <Text style={styles.statLabel}>Wins</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{user.losses}</Text>
                        <Text style={styles.statLabel}>Losses</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{winRate}</Text>
                        <Text style={styles.statLabel}>Win Rate</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={[styles.sidePanel, isWide && styles.sidePanelWide]}>
                <View style={styles.sideCard}>
                  <Text style={styles.sideCardTitle}>Quick Summary</Text>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Games</Text>
                    <Text style={styles.summaryValue}>{totalGames}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Current ELO</Text>
                    <Text style={styles.summaryValue}>{user.elo}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Record</Text>
                    <Text style={styles.summaryValue}>
                      {user.wins}W - {user.losses}L
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
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
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: palette.accentDark,
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: palette.text,
  },
  stateCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    gap: 10,
  },
  stateTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
  },
  stateText: {
    marginTop: 2,
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
  stateActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  contentRow: {
    gap: 18,
  },
  contentRowWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainPanel: {},
  mainPanelWide: {
    flex: 1.35,
  },
  sidePanel: {
    gap: 18,
  },
  sidePanelWide: {
    flex: 0.9,
  },
  profileCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 18,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: palette.chipBg,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: palette.accentDark,
  },
  profileHeaderText: {
    flex: 1,
  },
  username: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.text,
  },
  userSubtext: {
    marginTop: 4,
    fontSize: 14,
    color: palette.muted,
  },
  profileDetailsCard: {
    backgroundColor: palette.softCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F5D8E1',
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextWrap: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.muted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: palette.text,
    fontWeight: '600',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.accentDark,
  },
  statLabel: {
    marginTop: 6,
    fontSize: 13,
    color: palette.muted,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: palette.accentDark,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
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
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  summaryLabel: {
    fontSize: 14,
    color: palette.muted,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 15,
    color: palette.text,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F3D3DD',
    marginVertical: 12,
  },
});

