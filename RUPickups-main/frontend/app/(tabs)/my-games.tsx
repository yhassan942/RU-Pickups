/**
 * Shows the authenticated user's upcoming lobbies with refresh and quick navigation.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { API_BASE_URL, authedFetch } from '@/api/backend';

type Lobby = {
  lobby_id: string;
  host_user_id: string;
  lobby_name: string;
  sport: string;
  campus: string;
  location_id: string | null;
  is_public: boolean;
  max_players: number;
  status: string;
  scheduled_start_time: string;
  created_at: string;
  participant_count?: number | null;
  min_elo?: number;
};

type Location = {
  location_id: string;
  name: string;
  campus: string;
  address: string;
};

const RUTGERS_RED = '#CC0033';
const DARK_NAVY = '#111827';
const LIGHT_GRAY = '#F9FAFB';
const BORDER_GRAY = '#E5E7EB';
const MUTED_TEXT = '#6B7280';

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function MyGamesScreen() {
  const router = useRouter();
  const [upcomingLobbies, setUpcomingLobbies] = useState<Lobby[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lobbiesRes, locationsRes, meRes] = await Promise.all([
        authedFetch('/lobbies/my/upcoming'),
        fetch(`${API_BASE_URL}/locations/location_manifest`),
        authedFetch('/users/me'),
      ]);

      if (meRes.ok) {
        const me = (await meRes.json()) as { user_id: string };
        setCurrentUserId(me.user_id);
      }

      if (locationsRes.ok) {
        const locs = (await locationsRes.json()) as Location[];
        setLocations(locs);
      }

      if (lobbiesRes.ok) {
        const data = (await lobbiesRes.json()) as Lobby[];
        setUpcomingLobbies(
          data.sort(
            (a, b) =>
              new Date(a.scheduled_start_time).getTime() -
              new Date(b.scheduled_start_time).getTime(),
          ),
        );
        setError(null);
      } else {
        setUpcomingLobbies([]);
        const body = await lobbiesRes.text();
        let msg = 'Failed to load your games.';
        try {
          const j = JSON.parse(body) as { detail?: string };
          if (typeof j.detail === 'string') msg = j.detail;
        } catch {
          if (body.length > 0 && body.length < 200) msg = body;
        }
        setError(msg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setUpcomingLobbies([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const locationForLobby = (lobby: Lobby): Location | undefined =>
    locations.find((loc) => loc.location_id === lobby.location_id);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.heading}>My games</Text>
        <Text style={styles.subheading}>Upcoming</Text>

        {loading && upcomingLobbies.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.mutedText}>Loading your games…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : upcomingLobbies.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>No upcoming games</Text>
            <Text style={styles.emptySubtitle}>
              Join a lobby from the Lobbies tab or create one to see your games here.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/(tabs)/lobbies')}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>Find a game</Text>
            </TouchableOpacity>
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
            {upcomingLobbies.map((lobby) => {
              const loc = locationForLobby(lobby);
              const isHost = currentUserId === lobby.host_user_id;
              const dateLabel = formatDateOnly(lobby.scheduled_start_time);
              const timeLabel = formatTimeOnly(lobby.scheduled_start_time);

              return (
                <Pressable
                  key={lobby.lobby_id}
                  style={({ pressed }) => [
                    styles.gameCard,
                    pressed && styles.gameCardPressed,
                  ]}
                  onPress={() => router.push(`/lobby/${lobby.lobby_id}`)}
                >
                  <View style={styles.dateTimeBlock}>
                    <Text style={styles.dateText}>{dateLabel}</Text>
                    <Text style={styles.timeText}>{timeLabel}</Text>
                  </View>
                  <View style={styles.gameCardBody}>
                    <View style={styles.gameCardHeader}>
                      <Text style={styles.lobbyName}>{lobby.lobby_name}</Text>
                      {isHost && (
                        <View style={styles.hostPill}>
                          <Text style={styles.hostPillText}>Host</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sportText}>{lobby.sport}</Text>
                    <Text style={styles.campusText}>{lobby.campus}</Text>
                    {loc ? (
                      <Text style={styles.locationText}>{loc.name}</Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>
                        {(lobby.participant_count ?? 0)}/{lobby.max_players} players
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          lobby.status.toLowerCase() !== 'open' && styles.statusPillMuted,
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {lobby.status.charAt(0).toUpperCase() + lobby.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: RUTGERS_RED,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 18,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedText: {
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
  card: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 24,
    padding: 28,
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
    fontSize: 16,
    textAlign: 'center',
    color: MUTED_TEXT,
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: DARK_NAVY,
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  gameCard: {
    flexDirection: 'row',
    backgroundColor: LIGHT_GRAY,
    borderRadius: 18,
    padding: 0,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    overflow: 'hidden',
  },
  gameCardPressed: {
    opacity: 0.95,
  },
  dateTimeBlock: {
    width: 100,
    backgroundColor: DARK_NAVY,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
  },
  timeText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  gameCardBody: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  gameCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  lobbyName: {
    fontSize: 17,
    fontWeight: '700',
    color: DARK_NAVY,
    flex: 1,
  },
  hostPill: {
    backgroundColor: RUTGERS_RED,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hostPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sportText: {
    fontSize: 15,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  campusText: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginTop: 2,
  },
  locationText: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metaText: {
    fontSize: 13,
    color: MUTED_TEXT,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  statusPillMuted: {
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: DARK_NAVY,
  },
});
