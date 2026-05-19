/**
 * Sport-scoped leaderboard screen for top players ranked by ELO.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { API_BASE_URL } from '@/api/backend';

type LeaderboardUser = {
  user_id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
};

const SPORTS = [
  'Basketball',
  'Volleyball',
  'Pickleball',
  'Tennis',
  'Badminton',
  'Soccer',
] as const;
type Sport = (typeof SPORTS)[number];

const RUTGERS_RED = '#CC0033';
const DARK_NAVY = '#111827';
const LIGHT_GRAY = '#F9FAFB';
const BORDER_GRAY = '#E5E7EB';
const MUTED_TEXT = '#6B7280';
const GOLD = '#D4AF37';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <View style={[styles.rankBadge, styles.rankGold]}>
        <MaterialIcons name="emoji-events" size={24} color="#fff" />
      </View>
    );
  }
  if (rank === 2) {
    return (
      <View style={[styles.rankBadge, styles.rankSilver]}>
        <Text style={styles.rankBadgeText}>2</Text>
      </View>
    );
  }
  if (rank === 3) {
    return (
      <View style={[styles.rankBadge, styles.rankBronze]}>
        <Text style={styles.rankBadgeText}>3</Text>
      </View>
    );
  }
  return (
    <View style={styles.rankBadge}>
      <Text style={styles.rankNumber}>{rank}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSport] = useState<Sport>('Basketball');

  const loadLeaderboard = async (s: Sport) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/users/leaderboard?limit=10&sport=${encodeURIComponent(s)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load leaderboard (${res.status})`);
      }
      const data = (await res.json()) as LeaderboardUser[];
      setUsers(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard.');
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLeaderboard(sport);
  }, [sport]);

  const onRefresh = () => {
    setRefreshing(true);
    loadLeaderboard(sport);
  };

  if (loading && users.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>Top 10 by ELO</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <MaterialIcons name="emoji-events" size={32} color="#fff" />
          <Text style={styles.title}>Leaderboard</Text>
        </View>
        <Text style={styles.subtitle}>Top 10 players by {sport} ELO</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportTabs}
        >
          {SPORTS.map((s) => {
            const selected = s === sport;
            return (
              <Pressable
                key={s}
                onPress={() => setSport(s)}
                style={({ pressed }) => [
                  styles.sportTab,
                  selected && styles.sportTabSelected,
                  pressed && styles.sportTabPressed,
                ]}
              >
                <Text style={[styles.sportTabText, selected && styles.sportTabTextSelected]}>
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
        >
          {users.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No players yet</Text>
              <Text style={styles.emptySubtitle}>
                Win games to climb the leaderboard.
              </Text>
            </View>
          ) : (
            users.map((user, index) => {
              const rank = index + 1;
              return (
                <View key={user.user_id} style={styles.card}>
                  <View style={styles.cardLeft}>
                    <RankBadge rank={rank} />
                    <Pressable
                      onPress={() => router.push(`/player-profile/${user.user_id}`)}
                      style={({ pressed }) => [
                        styles.playerLink,
                        pressed && styles.playerLinkPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${user.username}'s profile`}
                    >
                      <View style={styles.playerAvatar}>
                        <Text style={styles.playerAvatarText}>
                          {(user.username || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName}>{user.username}</Text>
                        <Text style={styles.cardStats}>
                          {user.wins} W · {user.losses} L
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                  <View style={styles.eloWrap}>
                    <Text style={styles.eloLabel}>ELO</Text>
                    <Text style={styles.eloValue}>{user.elo}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: RUTGERS_RED,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
  },
  sportTabs: {
    paddingTop: 12,
    paddingBottom: 2,
    gap: 8,
  },
  sportTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  sportTabSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  sportTabPressed: {
    opacity: 0.85,
  },
  sportTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sportTabTextSelected: {
    color: DARK_NAVY,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  errorText: {
    fontSize: 16,
    color: '#FEE2E2',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  emptyCard: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GRAY,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DARK_NAVY,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: MUTED_TEXT,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: LIGHT_GRAY,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerLinkPressed: {
    opacity: 0.75,
  },
  playerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: RUTGERS_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: DARK_NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rankGold: {
    backgroundColor: GOLD,
  },
  rankSilver: {
    backgroundColor: SILVER,
  },
  rankBronze: {
    backgroundColor: BRONZE,
  },
  rankBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  cardStats: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginTop: 2,
  },
  eloWrap: {
    alignItems: 'flex-end',
  },
  eloLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED_TEXT,
    letterSpacing: 0.5,
  },
  eloValue: {
    fontSize: 22,
    fontWeight: '800',
    color: RUTGERS_RED,
  },
});
