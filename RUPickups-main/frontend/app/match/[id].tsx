/**
 * Match detail and progression screen for start, completion, and participant views.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authedFetch, authedFetchForLobby } from '@/api/backend';

type Match = {
  match_id: string;
  lobby_id: string;
  match_number: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  winner_team: string | null;
  created_at: string;
};

type Participant = {
  player_id: string;
  username: string;
  is_ready: boolean;
  current_team: string | null;
};

type Lobby = {
  lobby_id: string;
  max_players: number;
  sport: string;
  host_user_id: string;
};

type MatchPlayer = {
  match_id: string;
  player_id: string;
  team: 'team_a' | 'team_b';
};

type TeamKey = 'teamA' | 'teamB';
type TeamSlotsState = { teamA: Array<string | null>; teamB: Array<string | null> };

const RUTGERS_RED = '#CC0033';
const DARK_NAVY = '#111827';
const LIGHT_GRAY = '#F9FAFB';
const BORDER_GRAY = '#E5E7EB';
const MUTED_TEXT = '#6B7280';
const SYNC_INTERVAL_MS = 3000;

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function buildSlotsFromAssignments(
  maxPlayers: number,
  assignments: MatchPlayer[]
): TeamSlotsState {
  const teamASlots = Math.ceil(Math.max(maxPlayers, 0) / 2);
  const teamBSlots = Math.floor(Math.max(maxPlayers, 0) / 2);

  const teamA: Array<string | null> = Array(teamASlots).fill(null);
  const teamB: Array<string | null> = Array(teamBSlots).fill(null);

  for (const row of assignments) {
    if (row.team === 'team_a') {
      const idx = teamA.findIndex((v) => v === null);
      if (idx !== -1) teamA[idx] = row.player_id;
      continue;
    }
    if (row.team === 'team_b') {
      const idx = teamB.findIndex((v) => v === null);
      if (idx !== -1) teamB[idx] = row.player_id;
    }
  }

  return { teamA, teamB };
}

export default function MatchPage() {
  const { id: matchId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInsetPadding = Math.max(insets.top + (Platform.OS === 'android' ? 18 : 0), 12);

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Participant[]>([]);
  const [lobby, setLobby] = useState<Lobby | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [teamSlots, setTeamSlots] = useState<TeamSlotsState>({ teamA: [], teamB: [] });

  const [elapsedMs, setElapsedMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [syncingTeams, setSyncingTeams] = useState(false);

  const [winnerModalVisible, setWinnerModalVisible] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<'team_a' | 'team_b' | null>(null);

  const matchStatus = (match?.status ?? '').toLowerCase();
  const isInProgress = matchStatus === 'in_progress';
  const isCompleted = matchStatus === 'completed';
  const isHost = !!(currentUserId && lobby?.host_user_id && currentUserId === lobby.host_user_id);
  const canEditTeams = isHost && !isInProgress && !isCompleted && !syncingTeams && !submitting;
  const canControlMatch = isHost && !submitting && !syncingTeams;

  const startedAtMs = useMemo(() => {
    if (!match?.started_at) return null;
    const ms = new Date(match.started_at).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, [match?.started_at]);

  const teamASlots = useMemo(() => Math.ceil(Math.max(lobby?.max_players ?? 0, 0) / 2), [lobby?.max_players]);
  const teamBSlots = useMemo(() => Math.floor(Math.max(lobby?.max_players ?? 0, 0) / 2), [lobby?.max_players]);

  const playersById = useMemo(() => new Map(players.map((p) => [p.player_id, p])), [players]);

  const assignedIds = useMemo(
    () => new Set([...teamSlots.teamA, ...teamSlots.teamB].filter((id): id is string => id !== null)),
    [teamSlots]
  );

  const hydrateSnapshot = useCallback(
    async (silent = false) => {
      if (!matchId) {
        setError('Missing match ID.');
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      setError(null);

      try {
        const matchRes = await authedFetch(`/matches/${matchId}`);
        if (!matchRes.ok) {
          throw new Error(`Failed to load match (${matchRes.status})`);
        }

        const matchData = (await matchRes.json()) as Match;
        setMatch(matchData);

        const lid = matchData.lobby_id;
        const [lobbyRes, participantsRes, matchPlayersRes] = await Promise.all([
          authedFetchForLobby(lid, `/lobbies/${lid}`),
          authedFetchForLobby(lid, `/lobbies/${lid}/participants`),
          authedFetch(`/match-players/by-match/${matchData.match_id}`),
        ]);

        let nextLobby: Lobby | null = null;
        if (lobbyRes.ok) {
          nextLobby = (await lobbyRes.json()) as Lobby;
          setLobby(nextLobby);
        } else {
          setLobby(null);
        }

        if (participantsRes.ok) {
          const participantData = (await participantsRes.json()) as Participant[];
          setPlayers(participantData);
        } else {
          setPlayers([]);
        }

        if (matchPlayersRes.ok) {
          const rows = (await matchPlayersRes.json()) as MatchPlayer[];
          const maxPlayers = nextLobby?.max_players ?? 0;
          setTeamSlots(buildSlotsFromAssignments(maxPlayers, rows));
        } else {
          setTeamSlots(buildSlotsFromAssignments(nextLobby?.max_players ?? 0, []));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load match page.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [matchId]
  );

  const loadCurrentUser = useCallback(async () => {
    try {
      const meRes = await authedFetch('/users/me');
      if (!meRes.ok) {
        setCurrentUserId(null);
        return;
      }
      const me = (await meRes.json()) as { user_id: string };
      setCurrentUserId(me.user_id ?? null);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
    void hydrateSnapshot(false);
  }, [hydrateSnapshot, loadCurrentUser]);

  useEffect(() => {
    const interval = setInterval(() => {
      void hydrateSnapshot(true);
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hydrateSnapshot]);

  useEffect(() => {
    if (isInProgress && startedAtMs != null) {
      setElapsedMs(Math.max(Date.now() - startedAtMs, 0));
      const interval = setInterval(() => {
        setElapsedMs(Math.max(Date.now() - startedAtMs, 0));
      }, 1000);
      return () => clearInterval(interval);
    }

    setElapsedMs(0);
    return undefined;
  }, [isInProgress, startedAtMs]);

  useEffect(() => {
    const validPlayerIds = new Set(players.map((p) => p.player_id));
    if (selectedPlayerId && !validPlayerIds.has(selectedPlayerId)) {
      setSelectedPlayerId(null);
    }
  }, [players, selectedPlayerId]);

  useEffect(() => {
    if (!match?.lobby_id) return;
    if (!isCompleted) return;

    const t = setTimeout(() => {
      router.replace({ pathname: '/lobby/[id]', params: { id: match.lobby_id, fromMatch: '1' } });
    }, 500);

    return () => clearTimeout(t);
  }, [isCompleted, match?.lobby_id, router]);

  const handleBackToLobby = () => {
    if (!match?.lobby_id) {
      router.replace('/(tabs)/lobbies');
      return;
    }
    router.replace({ pathname: '/lobby/[id]', params: { id: match.lobby_id, fromMatch: '1' } });
  };

  const persistTeamAssignments = useCallback(
    async (nextSlots: TeamSlotsState) => {
      if (!match?.match_id) return;

      const teamAPlayerIds = nextSlots.teamA.filter((id): id is string => Boolean(id));
      const teamBPlayerIds = nextSlots.teamB.filter((id): id is string => Boolean(id));

      setSyncingTeams(true);
      try {
        const deleteRes = await authedFetch(
          `/match-players/?match_id=${encodeURIComponent(match.match_id)}`,
          { method: 'DELETE' }
        );
        if (!deleteRes.ok) {
          const msg = await deleteRes.text().catch(() => '');
          throw new Error(msg || `Failed to reset team assignments (${deleteRes.status})`);
        }

        if (teamAPlayerIds.length > 0 || teamBPlayerIds.length > 0) {
          const upsertRes = await authedFetch('/match-players/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              match_id: match.match_id,
              team_A_player_ids: teamAPlayerIds,
              team_B_player_ids: teamBPlayerIds,
            }),
          });

          if (!upsertRes.ok) {
            const msg = await upsertRes.text().catch(() => '');
            throw new Error(msg || `Failed to save team assignments (${upsertRes.status})`);
          }
        }

        await hydrateSnapshot(true);
      } finally {
        setSyncingTeams(false);
      }
    },
    [hydrateSnapshot, match?.match_id]
  );

  const handleSelectPlayer = (playerId: string) => {
    if (!canEditTeams) return;
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  };

  const handleSlotPress = async (team: TeamKey, index: number) => {
    if (!canEditTeams || !selectedPlayerId) return;

    const next: TeamSlotsState = {
      teamA: teamSlots.teamA.map((id) => (id === selectedPlayerId ? null : id)),
      teamB: teamSlots.teamB.map((id) => (id === selectedPlayerId ? null : id)),
    };

    const targetSlots = team === 'teamA' ? next.teamA : next.teamB;
    if (targetSlots[index] !== null) return;
    targetSlots[index] = selectedPlayerId;

    const previous = teamSlots;
    setTeamSlots(next);
    setSelectedPlayerId(null);

    try {
      await persistTeamAssignments(next);
    } catch (e) {
      setTeamSlots(previous);
      const message = e instanceof Error ? e.message : 'Failed to assign player.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Assign Player', message);
    }
  };

  const handleRandomizeTeams = async () => {
    if (!canEditTeams || !lobby || players.length === 0) return;

    try {
      const params = new URLSearchParams();
      players.forEach((p) => params.append('match_players', p.player_id));
      params.append('match_sport', lobby.sport);

      const res = await authedFetch(`/matches/matchmaking?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to randomize teams.');
      }

      const data = (await res.json()) as {
        team_a: Array<[string, number]>;
        team_b: Array<[string, number]>;
      };

      const next: TeamSlotsState = {
        teamA: Array(teamASlots).fill(null),
        teamB: Array(teamBSlots).fill(null),
      };

      data.team_a.forEach(([playerId], idx) => {
        if (idx < next.teamA.length) next.teamA[idx] = playerId;
      });
      data.team_b.forEach(([playerId], idx) => {
        if (idx < next.teamB.length) next.teamB[idx] = playerId;
      });

      setTeamSlots(next);
      setSelectedPlayerId(null);
      await persistTeamAssignments(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to randomize teams.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Randomize Teams', message);
    }
  };

  const onStartMatch = async () => {
    if (!canControlMatch || !match?.match_id || isInProgress || isCompleted) return;

    const teamAPlayerIds = teamSlots.teamA.filter((id): id is string => Boolean(id));
    const teamBPlayerIds = teamSlots.teamB.filter((id): id is string => Boolean(id));

    if (teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) {
      Alert.alert('Start Match', 'Assign at least one player to each team.');
      return;
    }

    setSubmitting(true);
    try {
      await persistTeamAssignments(teamSlots);

      const startRes = await authedFetch(`/matches/${match.match_id}/start`, {
        method: 'PATCH',
      });

      if (!startRes.ok) {
        const msg = await startRes.text().catch(() => '');
        throw new Error(msg || `Failed to start match (${startRes.status})`);
      }

      const updated = (await startRes.json()) as Match;
      setMatch(updated);
      await hydrateSnapshot(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start match.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Start Match', message);
    } finally {
      setSubmitting(false);
    }
  };

  const onEndMatch = () => {
    if (!canControlMatch || !isInProgress) return;
    setSelectedWinner(null);
    setWinnerModalVisible(true);
  };

  const onConfirmWinner = async () => {
    if (!canControlMatch || !selectedWinner || !match?.match_id) {
      Alert.alert('End Match', 'Please choose a winner.');
      return;
    }

    const teamAIds = teamSlots.teamA.filter((id): id is string => Boolean(id));
    const teamBIds = teamSlots.teamB.filter((id): id is string => Boolean(id));

    const winnerIds = selectedWinner === 'team_a' ? teamAIds : teamBIds;
    const loserIds = selectedWinner === 'team_a' ? teamBIds : teamAIds;

    if (winnerIds.length === 0 || loserIds.length === 0) {
      Alert.alert('End Match', 'Both teams need at least one assigned player.');
      return;
    }

    setSubmitting(true);
    try {
      const sport = lobby?.sport ?? 'Basketball';

      const statsParams = new URLSearchParams();
      winnerIds.forEach((id) => statsParams.append('winner_ids', id));
      loserIds.forEach((id) => statsParams.append('loser_ids', id));
      statsParams.append('sport', sport);

      const processRes = await authedFetch(`/player-stats/process?${statsParams.toString()}`, {
        method: 'PATCH',
      });
      if (!processRes.ok) {
        const msg = await processRes.text().catch(() => '');
        throw new Error(msg || `Failed to process match stats (${processRes.status})`);
      }

      const completeRes = await authedFetch(
        `/matches/${match.match_id}/complete?winner_team=${encodeURIComponent(selectedWinner)}`,
        { method: 'PATCH' }
      );
      if (!completeRes.ok) {
        const msg = await completeRes.text().catch(() => '');
        throw new Error(msg || `Failed to complete match (${completeRes.status})`);
      }

      await authedFetch(`/match-players/?match_id=${encodeURIComponent(match.match_id)}`, {
        method: 'DELETE',
      });

      setWinnerModalVisible(false);
      setSelectedWinner(null);
      router.replace({ pathname: '/lobby/[id]', params: { id: match.lobby_id } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to end match.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('End Match', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: topInsetPadding }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBackToLobby}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Back to lobby"
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title}>Match</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.mutedOnRed}>Loading match...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.timerText}>{formatDuration(elapsedMs)}</Text>

            {!isHost ? (
              <Text style={styles.hostNotice}>Host controls start/end and team assignment.</Text>
            ) : null}

            {isCompleted ? (
              <View style={styles.completedPill}>
                <Text style={styles.completedPillText}>Match completed</Text>
              </View>
            ) : isInProgress ? (
              <Pressable
                onPress={() => void onEndMatch()}
                style={[styles.endButton, (!canControlMatch || submitting) && styles.disabledButton]}
                disabled={!canControlMatch || submitting}
              >
                <Text style={styles.endButtonText}>{submitting ? 'Ending…' : 'End Match'}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void onStartMatch()}
                style={[styles.startButton, (!canControlMatch || submitting) && styles.disabledButton]}
                disabled={!canControlMatch || submitting}
              >
                <Text style={styles.startButtonText}>{submitting ? 'Starting…' : 'Start Match'}</Text>
              </Pressable>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Players ({players.length})</Text>
              <View style={styles.card}>
                {players.length === 0 ? (
                  <Text style={styles.emptyText}>No players found for this lobby.</Text>
                ) : (
                  players.map((p) => {
                    const selected = selectedPlayerId === p.player_id;
                    const assigned = assignedIds.has(p.player_id);

                    return (
                      <Pressable
                        key={p.player_id}
                        onPress={() => void handleSelectPlayer(p.player_id)}
                        disabled={!canEditTeams}
                        style={({ pressed }) => [
                          styles.playerRow,
                          selected && styles.playerRowSelected,
                          assigned && styles.playerRowAssigned,
                          pressed && canEditTeams && styles.playerRowPressed,
                          !canEditTeams && styles.disabledRow,
                        ]}
                      >
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{p.username.charAt(0).toUpperCase()}</Text>
                        </View>

                        <Text style={styles.playerName}>{p.username}</Text>
                        <Text style={styles.playerTag}>
                          {selected
                            ? 'Selected'
                            : assigned
                              ? 'Assigned'
                              : canEditTeams
                                ? 'Tap to select'
                                : 'Read only'}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
              <Text style={styles.helperText}>
                {canEditTeams
                  ? selectedPlayerId
                    ? 'Now tap an empty team slot.'
                    : 'Tap a player, then tap an empty slot.'
                  : 'Waiting for host to edit teams.'}
              </Text>
            </View>

            <View style={styles.section}>
              <Pressable
                onPress={() => void handleRandomizeTeams()}
                disabled={!canEditTeams}
                style={({ pressed }) => [
                  styles.randomizeButton,
                  pressed && canEditTeams && { opacity: 0.85 },
                  !canEditTeams && styles.disabledButton,
                ]}
              >
                <Text style={styles.randomizeButtonText}>Randomize Teams</Text>
              </Pressable>

              <Text style={styles.sectionTitle}>Teams</Text>

              <View style={styles.card}>
                <Text style={styles.teamTitle}>Team A</Text>
                {Array.from({ length: teamASlots }).map((_, i) => {
                  const playerId = teamSlots.teamA[i];
                  const player = playerId ? playersById.get(playerId) : null;
                  const isEmpty = !player;

                  return (
                    <Pressable
                      key={`a-${i}`}
                      onPress={() => void handleSlotPress('teamA', i)}
                      disabled={!canEditTeams}
                      style={[
                        styles.slotRow,
                        isEmpty && selectedPlayerId && canEditTeams && styles.slotRowTarget,
                        !canEditTeams && styles.disabledRow,
                      ]}
                    >
                      <Text style={player ? styles.slotFilledText : styles.slotText}>
                        {player ? player.username : `Slot ${i + 1} · Empty`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.teamTitle}>Team B</Text>
                {Array.from({ length: teamBSlots }).map((_, i) => {
                  const playerId = teamSlots.teamB[i];
                  const player = playerId ? playersById.get(playerId) : null;
                  const isEmpty = !player;

                  return (
                    <Pressable
                      key={`b-${i}`}
                      onPress={() => void handleSlotPress('teamB', i)}
                      disabled={!canEditTeams}
                      style={[
                        styles.slotRow,
                        isEmpty && selectedPlayerId && canEditTeams && styles.slotRowTarget,
                        !canEditTeams && styles.disabledRow,
                      ]}
                    >
                      <Text style={player ? styles.slotFilledText : styles.slotText}>
                        {player ? player.username : `Slot ${i + 1} · Empty`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={winnerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWinnerModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Who won the match?</Text>

            <Pressable
              onPress={() => setSelectedWinner('team_a')}
              style={[styles.winnerOption, selectedWinner === 'team_a' && styles.winnerOptionSelected]}
              disabled={!isHost || submitting}
            >
              <Text
                style={[
                  styles.winnerOptionText,
                  selectedWinner === 'team_a' && styles.winnerOptionTextSelected,
                ]}
              >
                Team A
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedWinner('team_b')}
              style={[styles.winnerOption, selectedWinner === 'team_b' && styles.winnerOptionSelected]}
              disabled={!isHost || submitting}
            >
              <Text
                style={[
                  styles.winnerOptionText,
                  selectedWinner === 'team_b' && styles.winnerOptionTextSelected,
                ]}
              >
                Team B
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void onConfirmWinner()}
              disabled={!selectedWinner || submitting || !isHost}
              style={[
                styles.confirmWinnerButton,
                (!selectedWinner || submitting || !isHost) && styles.confirmWinnerButtonDisabled,
              ]}
            >
              <Text style={styles.confirmWinnerButtonText}>
                {submitting ? 'Confirming…' : 'Confirm'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setWinnerModalVisible(false)}
              style={styles.cancelModalButton}
              disabled={submitting}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: RUTGERS_RED },
  container: { padding: 20, paddingBottom: 28 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#FFFFFF' },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: { opacity: 0.75 },
  headerSpacer: { width: 36, height: 36 },

  center: { alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  mutedOnRed: { marginTop: 8, color: 'rgba(255,255,255,0.9)' },
  errorText: { color: '#FEE2E2', textAlign: 'center' },

  timerText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },

  hostNotice: {
    color: '#FEE2E2',
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
  },

  completedPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.35)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 24,
  },
  completedPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  startButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  startButtonText: { color: RUTGERS_RED, fontSize: 16, fontWeight: '700' },

  endButton: {
    backgroundColor: '#B91C1C',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  endButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  disabledButton: { opacity: 0.6 },
  disabledRow: { opacity: 0.75 },

  section: { marginBottom: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },

  card: {
    backgroundColor: LIGHT_GRAY,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    borderRadius: 16,
    padding: 14,
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  playerRowPressed: { opacity: 0.9 },
  playerRowSelected: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204, 0, 51, 0.08)',
  },
  playerRowAssigned: {
    borderColor: '#D1D5DB',
  },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: RUTGERS_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: { color: '#FFFFFF', fontWeight: '700' },

  playerName: { color: DARK_NAVY, fontSize: 15, fontWeight: '600' },
  playerTag: {
    marginLeft: 'auto',
    fontSize: 12,
    color: MUTED_TEXT,
  },

  helperText: {
    marginTop: 8,
    color: '#FEE2E2',
    fontSize: 12,
  },

  teamTitle: { color: DARK_NAVY, fontSize: 15, fontWeight: '700', marginBottom: 8 },

  slotRow: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER_GRAY,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  slotRowTarget: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204, 0, 51, 0.08)',
  },
  slotText: { color: MUTED_TEXT, fontSize: 14 },
  slotFilledText: { color: DARK_NAVY, fontSize: 14, fontWeight: '700' },

  emptyText: { color: MUTED_TEXT, fontSize: 14 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DARK_NAVY,
    marginBottom: 12,
  },
  winnerOption: {
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  winnerOptionSelected: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204,0,51,0.08)',
  },
  winnerOptionText: {
    color: DARK_NAVY,
    fontSize: 15,
    fontWeight: '600',
  },
  winnerOptionTextSelected: { color: RUTGERS_RED },

  confirmWinnerButton: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: RUTGERS_RED,
    alignItems: 'center',
    paddingVertical: 12,
  },
  confirmWinnerButtonDisabled: { opacity: 0.6 },
  confirmWinnerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelModalButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelModalButtonText: {
    color: MUTED_TEXT,
    fontSize: 14,
    fontWeight: '600',
  },

  randomizeButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  randomizeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});