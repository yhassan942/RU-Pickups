/**
 * Lobby detail screen for participants, host controls, and match entry points.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL, authedFetch, authedFetchForLobby } from '@/api/backend';
import { setLobbyUnlockTokenSync } from '@/api/lobbyUnlock';

const SPORT_OPTIONS = [
  'Basketball',
  'Volleyball',
  'Pickleball',
  'Tennis',
  'Badminton',
  'Soccer',
] as const;
const SPORT_MAX_PLAYERS: Record<(typeof SPORT_OPTIONS)[number], number> = {
  Basketball: 10,
  Volleyball: 12,
  Pickleball: 4,
  Tennis: 4,
  Badminton: 4,
  Soccer: 22,
};
const CAMPUS_COLORS: Record<string, string> = {
  'College Ave': '#CC0033',
  Busch: '#0054A4',
  Livingston: '#2E7D32',
  'Cook/Douglass': '#E65100',
};

const CAMPUS_IMAGES = {
  collegeave: require('../photos/CollegeAve.jpg'),
  cookdouglass: require('../photos/Cook:Douglass.jpg'),
  livingston: require('../photos/Livingston.jpg'),
  busch: require('../photos/Busch.jpg'),
} as const;

function normalizeCampus(campus: string): string {
  const compact = campus.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (compact === 'collegeavenue' || compact === 'collegeave' || compact === 'ca') return 'collegeave';
  if (compact === 'cookdouglass' || compact === 'cookanddouglass' || compact === 'cd') return 'cookdouglass';
  return compact;
}

function getCampusColor(campus: string): string {
  return CAMPUS_COLORS[campus] ?? '#6B7280';
}

function campusThumbFor(campus: string | undefined | null) {
  const key = normalizeCampus(campus ?? '');
  if (key === 'collegeave') return CAMPUS_IMAGES.collegeave;
  if (key === 'cookdouglass') return CAMPUS_IMAGES.cookdouglass;
  if (key === 'livingston') return CAMPUS_IMAGES.livingston;
  return CAMPUS_IMAGES.busch;
}

function sportIconFor(sport: string): keyof typeof MaterialIcons.glyphMap {
  const s = sport.trim().toLowerCase();
  if (s === 'basketball') return 'sports-basketball';
  if (s === 'soccer') return 'sports-soccer';
  if (s === 'tennis') return 'sports-tennis';
  if (s === 'volleyball') return 'sports-volleyball';
  if (s === 'pickleball' || s === 'badminton') return 'sports-tennis';
  return 'sports';
}

function locationMatchesSport(location: Location, sport: string): boolean {
  const selected = sport.trim().toLowerCase();
  if (!selected) return true;
  const name = `${location.name} ${location.address}`.toLowerCase();
  if (selected === 'basketball') {
    return (
      name.includes('basketball') ||
      name.includes('main gym') ||
      name.includes('annex') ||
      name.includes('gym')
    );
  }
  if (selected === 'volleyball') return name.includes('volleyball');
  if (selected === 'pickleball') return name.includes('pickleball') || name.includes('pickle');
  if (selected === 'tennis') return name.includes('tennis');
  if (selected === 'badminton') {
    return (
      name.includes('badminton') ||
      name.includes('tennis') ||
      name.includes('pickleball') ||
      name.includes('pickle')
    );
  }
  if (selected === 'soccer') {
    return name.includes('soccer') || name.includes('field') || name.includes('turf');
  }
  return name.includes(selected);
}

function maxPlayersForSport(sport: string): number {
  const hit = SPORT_OPTIONS.find((s) => s === sport.trim());
  return hit ? SPORT_MAX_PLAYERS[hit] : 50;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function slotKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

function buildTimeSlotsForDay(day: Date): Date[] {
  const base = startOfDay(day);
  const slots: Date[] = [];
  for (let hour = 8; hour <= 22; hour++) {
    const d = new Date(base);
    d.setHours(hour, 0, 0, 0);
    slots.push(d);
  }
  return slots;
}

function formatReservationSummary(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayChip(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatSlotTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toGoogleCalendarUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

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
  participant_average_elo?: number | null;
  participant_count?: number | null;
  participant_details_hidden?: boolean;
  min_elo?: number;
};

type Location = {
  location_id: string;
  name: string;
  campus: string;
  address: string;
};

type Participant = {
  player_id: string;
  username: string;
  is_ready: boolean;
  current_team: string | null;
};

type LobbyTab = 'about' | 'participants';

type LeaveLobbyResult = {
  result: 'left' | 'host_transferred' | 'lobby_deleted';
  new_host_user_id?: string | null;
};

type ActiveMatchResponse = {
  match_id: string;
  status: string;
};

const RUTGERS_RED = '#CC0033';
const DARK_NAVY = '#111827';
const LIGHT_GRAY = '#F9FAFB';
const BORDER_GRAY = '#E5E7EB';
const MUTED_TEXT = '#6B7280';

export default function LobbyDetailScreen() {
  const { id, fromMatch } = useLocalSearchParams<{ id: string; fromMatch?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInsetPadding = Math.max(insets.top + (Platform.OS === 'android' ? 18 : 0), 12);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /** Your ELO per sport from `player_stats` (matches backend lobby rules). */
  const [sportEloBySport, setSportEloBySport] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editLobbyName, setEditLobbyName] = useState('');
  const [editSport, setEditSport] = useState('');
  const [editLocationId, setEditLocationId] = useState<string | null>(null);
  const [editScheduledAt, setEditScheduledAt] = useState<Date>(() => new Date());
  const [editSelectedDay, setEditSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [editSelectedSlot, setEditSelectedSlot] = useState<Date | null>(null);
  const [editMaxPlayers, setEditMaxPlayers] = useState('10');
  const [editMinElo, setEditMinElo] = useState('0');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editLocationPickerOpen, setEditLocationPickerOpen] = useState(false);
  const [showEditPicker, setShowEditPicker] = useState(false);
  const [editAndroidPickerStep, setEditAndroidPickerStep] = useState<'date' | 'time'>('date');
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [redirectingToMatch, setRedirectingToMatch] = useState(false);
  const [joinPasswordModalOpen, setJoinPasswordModalOpen] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinUnlockBusy, setJoinUnlockBusy] = useState(false);
  const [joinUnlockError, setJoinUnlockError] = useState<string | null>(null);
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [calendarPromptOpen, setCalendarPromptOpen] = useState(false);

  const [initialEditWasPublic, setInitialEditWasPublic] = useState(true);
  const [editPrivatePassword, setEditPrivatePassword] = useState('');
  const [editPrivatePasswordConfirm, setEditPrivatePasswordConfirm] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditPasswordConfirm, setShowEditPasswordConfirm] = useState(false);
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<LobbyTab>('about');
  const [reservationLobbies, setReservationLobbies] = useState<Lobby[]>([]);

  const loadLobby = useCallback(async () => {
    if (!id) return;
    try {
      const res = await authedFetchForLobby(id, `/lobbies/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Lobby not found.');
          setLobby(null);
          return;
        }
        throw new Error(`Failed to load lobby (${res.status})`);
      }
      const data = (await res.json()) as Lobby;
      setLobby(data);
      setError(null);
    } catch (e) {
      setLobby(null);
      setError(e instanceof Error ? e.message : 'Failed to load lobby.');
    }
  }, [id]);

  const loadParticipants = useCallback(async () => {
    if (!id) return;
    try {
      const res = await authedFetchForLobby(id, `/lobbies/${id}/participants`);
      if (res.status === 403) {
        setParticipants([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as Participant[];
      setParticipants(data);
    } catch {
      setParticipants([]);
    }
  }, [id]);

  const loadLocations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/locations/location_manifest`);
      if (!res.ok) return;
      const data = (await res.json()) as Location[];
      setLocations(data);
    } catch {
      setLocations([]);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const [meRes, sportRes] = await Promise.all([
        authedFetch('/users/me'),
        authedFetch('/users/me/sport-stats'),
      ]);
      if (meRes.ok) {
        const data = (await meRes.json()) as { user_id: string };
        setCurrentUserId(data.user_id);
      } else {
        setCurrentUserId(null);
      }
      if (sportRes.ok) {
        const rows = (await sportRes.json()) as { sport: string; elo: number }[];
        const map: Record<string, number> = {};
        for (const r of rows) {
          if (r.sport && typeof r.elo === 'number') map[r.sport] = r.elo;
        }
        setSportEloBySport(map);
      } else {
        setSportEloBySport({});
      }
    } catch {
      setCurrentUserId(null);
      setSportEloBySport({});
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      await Promise.all([loadLobby(), loadParticipants()]);
    } finally {
      setLoading(false);
    }

    // Load locations and current user in the background so the main
    // lobby view appears as soon as core data is ready.
    void loadLocations();
    void loadCurrentUser();
  }, [id, loadLobby, loadParticipants, loadLocations, loadCurrentUser]);

  const fetchActiveMatch = useCallback(async (): Promise<ActiveMatchResponse | null> => {
    if (!id) return null;
    try {
      const res = await authedFetchForLobby(id, `/matches/lobby/${id}/active`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return (await res.json()) as ActiveMatchResponse;
    } catch {
      return null;
    }
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!id) return;
    if (fromMatch === '1') return;

    let cancelled = false;

    const checkAndNavigate = async () => {
      if (cancelled || redirectingToMatch) return;
      if (!currentUserId) return;

      const canViewActiveMatch =
        lobby?.host_user_id === currentUserId ||
        participants.some((p) => p.player_id === currentUserId);
      if (!canViewActiveMatch) return;

      const active = await fetchActiveMatch();
      if (!active?.match_id || cancelled) return;

      setRedirectingToMatch(true);
      router.replace({ pathname: '/match/[id]', params: { id: active.match_id } });
    };

    void checkAndNavigate();
    const interval = setInterval(() => {
      void checkAndNavigate();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, fromMatch, fetchActiveMatch, redirectingToMatch, router, currentUserId, lobby, participants]);

  const readErrorDetail = async (res: Response): Promise<string> => {
    const raw = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(raw) as { detail?: string };
      if (typeof parsed.detail === 'string') return parsed.detail;
    } catch {
      /* not JSON */
    }
    return raw;
  };

  const showJoinConflict = (isFull: boolean, detail: string) => {
    const title = isFull ? 'Lobby full' : 'Cannot join';
    const message = isFull
      ? 'Sorry, this lobby is full.'
      : detail || 'Could not join this lobby.';
    if (Platform.OS === 'web') {
      window.alert(message);
    } else {
      Alert.alert(title, message);
    }
  };

  const attemptJoin = async () => {
    if (!id) return;
    setJoinError(null);
    setJoining(true);
    try {
      const res = await authedFetchForLobby(id, `/lobbies/${id}/join`, { method: 'POST' });
      if (res.status === 409) {
        const detail = await readErrorDetail(res);
        const isFull = detail.toLowerCase().includes('full');
        showJoinConflict(isFull, detail);
        await Promise.all([loadParticipants(), loadLobby()]);
        return;
      }
      if (res.status === 403) {
        const detail = await readErrorDetail(res);
        showJoinConflict(false, detail);
        return;
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        setJoinError(msg || 'Failed to join lobby.');
        return;
      }

      if (currentUserId) {
        setParticipants((prev) => {
          if (prev.some((p) => p.player_id === currentUserId)) return prev;
          return [
            ...prev,
            { player_id: currentUserId, username: 'You', is_ready: false, current_team: null },
          ];
        });
      }

      void loadParticipants();
      void loadLobby();
      promptAddToCalendar();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join lobby.');
    } finally {
      setJoining(false);
    }
  };

  const handleJoin = async () => {
    if (!id || joining) return;
    if (joinRequiresPassword) {
      setJoinUnlockError(null);
      setJoinPassword('');
      setShowJoinPassword(false);
      setJoinPasswordModalOpen(true);
      return;
    }
    await attemptJoin();
  };

  const handleUnlockWithPasswordAndJoin = async () => {
    if (!id || joinUnlockBusy) return;
    setJoinUnlockError(null);
    setJoinUnlockBusy(true);
    try {
      const unlockRes = await authedFetch(`/lobbies/${id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: joinPassword }),
      });
      if (!unlockRes.ok) {
        const detail = await readErrorDetail(unlockRes);
        setJoinUnlockError(detail || 'Incorrect lobby password.');
        return;
      }
      const data = (await unlockRes.json()) as { unlock_token: string };
      setLobbyUnlockTokenSync(id, data.unlock_token);

      setJoinPasswordModalOpen(false);
      setJoinPassword('');

      const joinRes = await authedFetchForLobby(id, `/lobbies/${id}/join`, {
        method: 'POST',
      });
      if (!joinRes.ok) {
        const detail = await readErrorDetail(joinRes);
        setJoinError(detail || 'Failed to join lobby.');
        return;
      }

      // Optimistic update so the user sees themselves immediately
      if (currentUserId) {
        setParticipants((prev) => {
          if (prev.some((p) => p.player_id === currentUserId)) return prev;
          return [
            ...prev,
            { player_id: currentUserId, username: 'You', is_ready: false, current_team: null },
          ];
        });
      }

      // Reload from server to get authoritative data (username, etc.)
      void loadLobby();
      void loadParticipants();
      promptAddToCalendar();
    } catch (e) {
      setJoinUnlockError(e instanceof Error ? e.message : 'Could not unlock lobby.');
    } finally {
      setJoinUnlockBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!id || leaving) return;
    setJoinError(null);
    setLeaving(true);
    try {
      const res = await authedFetch(`/lobbies/${id}/leave`, { method: 'POST' });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        setJoinError(msg || 'Failed to leave lobby.');
        return;
      }

      const outcome = (await res.json()) as LeaveLobbyResult;
      if (outcome.result === 'lobby_deleted') {
        router.replace('/(tabs)/lobbies');
        return;
      }

      await Promise.all([loadLobby(), loadParticipants()]);
      setCalendarAdded(false);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to leave lobby.');
    } finally {
      setLeaving(false);
    }
  };

  const confirmLeave = () => {
    if (leaving) return;
  
    const participantCount = lobby?.participant_count ?? participants.length;
    const isLastParticipant = participantCount <= 1;
  
    const message = isLastParticipant
      ? 'You are the last participant. If you leave, this lobby will be terminated. Continue?'
      : 'Are you sure you want to leave this lobby?';
  
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(message);
      if (confirmed) void handleLeave();
      return;
    }
  
    Alert.alert('Leave lobby', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void handleLeave() },
    ]);
  };

  const handleCreateMatch = async () => {
    if (!id || creatingMatch) return;
  
    setCreatingMatch(true);
    try {
      const res = await authedFetch('/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobby_id: id }),
      });
  
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Failed to create match (${res.status})`);
      }
  
      const created = (await res.json()) as { match_id: string };
      setRedirectingToMatch(true);
      router.replace({ pathname: '/match/[id]', params: { id: created.match_id } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create match.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Create match', message);
      }
    } finally {
      setCreatingMatch(false);
    }
  };


  const isHost = currentUserId != null && lobby?.host_user_id === currentUserId;
  const isParticipant =
    isHost ||
    (currentUserId != null &&
      participants.some((p) => p.player_id === currentUserId));
  const rosterHidden = !!(lobby?.participant_details_hidden && !isHost);
  const joinRequiresPassword = !!lobby && lobby.is_public === false && !isParticipant;
  const isLobbyFull = !!lobby && participants.length >= lobby.max_players;
  const lobbyMinElo = lobby?.min_elo ?? 0;
  const myEloForLobbySport = useMemo(() => {
    if (!lobby?.sport) return 400;
    const v = sportEloBySport[lobby.sport];
    return typeof v === 'number' ? v : 400;
  }, [lobby?.sport, sportEloBySport]);
  const isBelowMinElo =
    lobbyMinElo > 0 && lobby != null && myEloForLobbySport < lobbyMinElo;

  const editLocations = useMemo(() => {
    const strict = locations.filter((loc) => locationMatchesSport(loc, editSport));
    if (strict.length > 0) return strict;
    return locations;
  }, [locations, editSport]);
  const editSelectedLocation = editLocationId
    ? editLocations.find((loc) => loc.location_id === editLocationId) ??
      locations.find((loc) => loc.location_id === editLocationId) ??
      null
    : null;

  useEffect(() => {
    if (!editLocationId) return;
    const stillValid = editLocations.some((loc) => loc.location_id === editLocationId);
    if (!stillValid) {
      setEditLocationId(null);
      setEditSelectedSlot(null);
    }
  }, [editLocationId, editLocations]);

  const editReservationDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = startOfDay(new Date());
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );
  const editAvailableTimeSlots = useMemo(() => buildTimeSlotsForDay(editSelectedDay), [editSelectedDay]);
  const editBookedSlotKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!editLocationId) return keys;
    for (const l of reservationLobbies) {
      if (l.location_id !== editLocationId) continue;
      if (id && l.lobby_id === id) continue;
      const status = (l.status || '').toLowerCase();
      if (status === 'cancelled' || status === 'completed') continue;
      const start = new Date(l.scheduled_start_time);
      if (!Number.isNaN(start.getTime())) keys.add(slotKey(start));
    }
    return keys;
  }, [reservationLobbies, editLocationId, id]);

  const myEloForEditSport = useMemo(() => {
    const s = editSport.trim();
    if (!s) return null;
    const v = sportEloBySport[s];
    return typeof v === 'number' ? v : 400;
  }, [editSport, sportEloBySport]);

  const openEdit = useCallback(() => {
    if (!lobby) return;
    const sportCap = maxPlayersForSport(lobby.sport);
    const initialStart = new Date(lobby.scheduled_start_time);
    setEditLobbyName(lobby.lobby_name);
    setEditSport(lobby.sport);
    setEditLocationId(lobby.location_id);
    setEditScheduledAt(initialStart);
    setEditSelectedDay(startOfDay(initialStart));
    setEditSelectedSlot(initialStart);
    setEditMaxPlayers(String(Math.min(lobby.max_players, sportCap)));
    setEditMinElo(String(lobby.min_elo ?? 0));
    setEditIsPublic(lobby.is_public);
    setInitialEditWasPublic(lobby.is_public);
    setEditPrivatePassword('');
    setEditPrivatePasswordConfirm('');
    setShowEditPassword(false);
    setShowEditPasswordConfirm(false);
    setEditError(null);
    void (async () => {
      try {
        const res = await authedFetch('/lobbies');
        if (!res.ok) return;
        const rows = (await res.json()) as Lobby[];
        setReservationLobbies(rows);
      } catch {
        // ignore reservation loading errors
      }
    })();
    setEditOpen(true);
  }, [lobby]);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditLocationPickerOpen(false);
    setShowEditPicker(false);
    setEditAndroidPickerStep('date');
  }, []);

  const openEditDatePicker = () => {
    if (Platform.OS === 'android') {
      setEditAndroidPickerStep('date');
    }
    setShowEditPicker(true);
  };

  const handleEditDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowEditPicker(false);
        setEditAndroidPickerStep('date');
        return;
      }
      if (!date) return;

      if (editAndroidPickerStep === 'date') {
        const next = new Date(editScheduledAt);
        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setEditScheduledAt(next);
        setEditAndroidPickerStep('time');
        setShowEditPicker(true);
        return;
      }

      // time step
      const next = new Date(editScheduledAt);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setEditScheduledAt(next);
      setShowEditPicker(false);
      setEditAndroidPickerStep('date');
      return;
    }

    // iOS
    if (date) setEditScheduledAt(date);
  };

  const handleSaveEdit = async () => {
    if (!id || !lobby || saving) return;
    const name = editLobbyName.trim();
    const trimmedSport = editSport.trim();
    const max = parseInt(editMaxPlayers, 10);
    if (!name) {
      setEditError('Please enter a lobby name.');
      return;
    }
    if (!trimmedSport) {
      setEditError('Please select a sport.');
      return;
    }
    const selectedLoc = editLocationId
      ? editLocations.find((loc) => loc.location_id === editLocationId)
      : null;
    if (!editLocationId || !selectedLoc) {
      setEditError('Please select a location.');
      return;
    }
    if (Number.isNaN(max) || max < 2) {
      setEditError('Max players must be at least 2.');
      return;
    }
    const sportCap = maxPlayersForSport(trimmedSport);
    if (max > sportCap) {
      setEditError(`${trimmedSport} lobbies can have at most ${sportCap} players.`);
      return;
    }
    const minEloTrim = editMinElo.trim();
    let minElo = 0;
    if (minEloTrim !== '') {
      minElo = parseInt(minEloTrim, 10);
      if (Number.isNaN(minElo) || minElo < 0) {
        setEditError('Minimum ELO must be a non-negative whole number.');
        return;
      }
      const cap =
        typeof sportEloBySport[editSport.trim()] === 'number'
          ? sportEloBySport[editSport.trim()]
          : 400;
      if (minElo > cap) {
        setEditError(
          `Minimum ELO cannot be higher than your ${editSport.trim()} ELO (${cap}).`,
        );
        return;
      }
    }
    const scheduledAt = editSelectedSlot ?? editScheduledAt;
    if (scheduledAt.getTime() <= Date.now()) {
      setEditError('Start time must be in the future.');
      return;
    }
    if (!editSelectedSlot) {
      setEditError('Please select an available reservation time slot.');
      return;
    }
    if (editBookedSlotKeys.has(slotKey(editSelectedSlot))) {
      setEditError('That court is already booked for this time slot. Please choose another slot.');
      return;
    }
    if (!editIsPublic) {
      if (initialEditWasPublic) {
        const p = editPrivatePassword.trim();
        const c = editPrivatePasswordConfirm.trim();
        if (p.length < 4) {
          setEditError('Private lobbies need a password of at least 4 characters.');
          return;
        }
        if (p !== c) {
          setEditError('Password and confirmation do not match.');
          return;
        }
      } else if (editPrivatePassword.trim().length > 0) {
        const p = editPrivatePassword.trim();
        const c = editPrivatePasswordConfirm.trim();
        if (p.length < 4 || p !== c) {
          setEditError('New password must be at least 4 characters and match confirmation.');
          return;
        }
      }
    }
    setEditError(null);
    setSaving(true);
    try {
      const patchBody: Record<string, unknown> = {
        lobby_name: name,
        sport: trimmedSport,
        campus: selectedLoc.campus,
        location_id: editLocationId,
        is_public: editIsPublic,
        max_players: max,
        min_elo: minElo,
        scheduled_start_time: scheduledAt.toISOString(),
      };
      if (!editIsPublic) {
        if (initialEditWasPublic) {
          patchBody.lobby_password = editPrivatePassword.trim();
        } else if (editPrivatePassword.trim().length > 0) {
          patchBody.lobby_password = editPrivatePassword.trim();
        }
      }
      const res = await authedFetch(`/lobbies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let msg = raw;
        try {
          const j = JSON.parse(raw) as { detail?: string };
          if (typeof j.detail === 'string') msg = j.detail;
        } catch {
          /* not JSON */
        }
        setEditError(msg || 'Failed to update lobby.');
        return;
      }
      const updated = (await res.json()) as Lobby;
      setLobby(updated);
      closeEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to update lobby.');
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!id) return;
    try {
      const res = await authedFetch(`/lobbies/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      router.replace('/(tabs)/lobbies');
    } catch {
      // ignore
    }
  };

  const handleDelete = () => {
    if (!id) return;
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Are you sure you want to delete this lobby? This cannot be undone.',
      );
      if (confirmed) void performDelete();
    } else {
      Alert.alert(
        'Delete lobby',
        'Are you sure you want to delete this lobby? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void performDelete() },
        ],
      );
    }
  };

  const location = lobby?.location_id
    ? locations.find((loc) => loc.location_id === lobby.location_id)
    : null;
  const when = lobby ? new Date(lobby.scheduled_start_time) : null;
  const whenLabel = when
    ? when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const campusLabel = lobby?.campus || location?.campus || '';
  const aboutThumb = campusThumbFor(campusLabel);
  const hostParticipant = lobby
    ? participants.find((p) => p.player_id === lobby.host_user_id)
    : null;

  const openLocationInMaps = useCallback(() => {
    if (!lobby) return;
    const query = location?.address || `${lobby.campus} ${location?.name || ''}`.trim();
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${encodeURIComponent(query)}`,
      android: `geo:0,0?q=${encodeURIComponent(query)}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    });
    if (!url) return;
    void Linking.openURL(url).catch(() => {
      /* ignore */
    });
  }, [lobby, location]);

  const openLobbyInGoogleCalendar = useCallback(async () => {
    if (!lobby) return;
    const start = new Date(lobby.scheduled_start_time);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + 90 * 60 * 1000);

    const title = `${lobby.lobby_name} (${lobby.sport})`;
    const eventLocation = [lobby.campus, location?.name, location?.address].filter(Boolean).join(' · ');
    const details = [
      `Sport: ${lobby.sport}`,
      `Lobby: ${lobby.lobby_name}`,
      `Campus: ${lobby.campus}`,
      location?.name ? `Court: ${location.name}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const url =
      'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      `&text=${encodeURIComponent(title)}` +
      `&dates=${toGoogleCalendarUtc(start)}/${toGoogleCalendarUtc(end)}` +
      `&location=${encodeURIComponent(eventLocation)}` +
      `&details=${encodeURIComponent(details)}`;

    try {
      await Linking.openURL(url);
      setCalendarAdded(true);
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not open Google Calendar.');
      } else {
        Alert.alert('Calendar', 'Could not open Google Calendar.');
      }
    }
  }, [lobby, location]);

  const promptAddToCalendar = useCallback(() => {
    if (calendarAdded) return;
    setCalendarPromptOpen(true);
  }, [calendarAdded]);

  if (!id) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, { paddingTop: topInsetPadding }]}>
          <Text style={styles.errorText}>Missing lobby ID.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, { paddingTop: topInsetPadding }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.replace('/(tabs)/lobbies')}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Lobby</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={RUTGERS_RED} />
            <Text style={styles.mutedText}>Loading...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : lobby ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#FFFFFF"
              />
            }
          >
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'about' && styles.tabBtnActive]}
                onPress={() => setActiveTab('about')}
                activeOpacity={0.9}
              >
                <Text style={[styles.tabBtnText, activeTab === 'about' && styles.tabBtnTextActive]}>
                  About
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'participants' && styles.tabBtnActive]}
                onPress={() => setActiveTab('participants')}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === 'participants' && styles.tabBtnTextActive,
                  ]}
                >
                  Participants
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'about' ? (
              <View style={styles.section}>
                <View style={styles.aboutCard}>
                  <View style={styles.aboutThumbTop}>
                    <Image source={aboutThumb} style={styles.aboutThumb} />
                  </View>

                  <View style={styles.aboutHeroTextWrap}>
                    <Text style={styles.aboutHeroTitle}>{lobby.lobby_name}</Text>
                    <View style={styles.aboutSportRow}>
                      <MaterialIcons name={sportIconFor(lobby.sport)} size={14} color={DARK_NAVY} />
                      <Text style={styles.aboutSportText}>{lobby.sport}</Text>
                    </View>
                  </View>

                  <View style={styles.aboutInfoRow}>
                    <MaterialIcons name="place" size={16} color={MUTED_TEXT} />
                    <Text style={styles.aboutValue}>
                      {lobby.campus}
                      {location ? ` · ${location.name}` : ''}
                    </Text>
                  </View>

                  <View style={styles.aboutInfoRow}>
                    <MaterialIcons name="schedule" size={16} color={MUTED_TEXT} />
                    <Text style={styles.aboutValue}>{whenLabel}</Text>
                  </View>

                  <View style={styles.aboutInfoRow}>
                    <MaterialIcons name="person" size={16} color={MUTED_TEXT} />
                    <Pressable onPress={() => router.push(`/player-profile/${lobby.host_user_id}`)}>
                      <Text style={styles.aboutLinkValue}>
                        {hostParticipant?.username || 'View host profile'}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.aboutInfoRow}>
                    <MaterialIcons name="trending-up" size={16} color={MUTED_TEXT} />
                    <Text style={styles.aboutValue}>
                      Min {lobbyMinElo} · Avg{' '}
                      {!rosterHidden && lobby.participant_average_elo != null
                        ? Math.round(lobby.participant_average_elo)
                        : 'Hidden'}
                    </Text>
                  </View>
                </View>

                <Pressable style={styles.mapCard} onPress={openLocationInMaps}>
                  <MaterialIcons name="place" size={22} color={RUTGERS_RED} />
                  <View style={styles.mapCardTextWrap}>
                    <Text style={styles.mapCardTitle}>Court map</Text>
                    <Text style={styles.mapCardSubtitle}>
                      Open pin for {location?.name || lobby.campus} in Maps
                    </Text>
                  </View>
                  <MaterialIcons name="open-in-new" size={20} color={MUTED_TEXT} />
                </Pressable>

                {isParticipant && !calendarAdded ? (
                  <Pressable style={styles.calendarCard} onPress={() => void openLobbyInGoogleCalendar()}>
                    <MaterialIcons name="event" size={22} color={RUTGERS_RED} />
                    <View style={styles.mapCardTextWrap}>
                      <Text style={styles.mapCardTitle}>Add to Calendar</Text>
                      <Text style={styles.mapCardSubtitle}>
                        Add {lobby.lobby_name} to Google Calendar
                      </Text>
                    </View>
                    <MaterialIcons name="open-in-new" size={20} color={MUTED_TEXT} />
                  </Pressable>
                ) : null}

                {isHost ? (
                  <View style={styles.hostActionsRow}>
                    <TouchableOpacity style={styles.editButton} onPress={openEdit} activeOpacity={0.9}>
                      <MaterialIcons name="edit" size={20} color={RUTGERS_RED} />
                      <Text style={styles.editButtonText}>Edit lobby</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={handleDelete}
                      activeOpacity={0.9}
                    >
                      <MaterialIcons name="delete-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.deleteButtonText}>Delete lobby</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {isParticipant ? 'You are in this lobby' : 'Join'}
                  </Text>
                  {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
                  {!isParticipant && isBelowMinElo ? (
                    <Text style={styles.mutedText}>
                      Your {lobby.sport} ELO ({myEloForLobbySport}) is below this lobby&apos;s minimum (
                      {lobbyMinElo}).
                    </Text>
                  ) : null}
                  {isParticipant ? (
                    <TouchableOpacity
                      style={[styles.leaveButton, leaving && styles.joinButtonDisabled]}
                      onPress={confirmLeave}
                      disabled={leaving}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.leaveButtonText}>
                        {leaving ? 'Leaving…' : 'Leave lobby'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.joinButton, joining && styles.joinButtonDisabled]}
                      onPress={handleJoin}
                      disabled={joining || lobby.status !== 'open' || isLobbyFull || isBelowMinElo}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.joinButtonText}>
                        {joining
                          ? 'Joining…'
                          : isLobbyFull
                            ? 'Lobby full'
                            : isBelowMinElo
                              ? 'ELO too low'
                              : joinRequiresPassword
                                ? 'Join this private lobby'
                                : 'Join this lobby'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {isHost ? (
                  <View style={styles.section}>
                    <TouchableOpacity
                      style={[styles.createMatchButton, (creatingMatch || redirectingToMatch) && styles.joinButtonDisabled]}
                      onPress={() => void handleCreateMatch()}
                      disabled={creatingMatch || redirectingToMatch}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.createMatchButtonText}>
                        {creatingMatch || redirectingToMatch ? 'Starting match…' : 'Start match'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {rosterHidden ? 'Participants' : `Participants (${participants.length})`}
                  </Text>
                  <View style={styles.participantList}>
                    {rosterHidden ? (
                      <Text style={styles.emptyParticipants}>
                        Hidden — tap &quot;Join this private lobby&quot; and enter the password to see who is
                        playing.
                      </Text>
                    ) : participants.length === 0 ? (
                      <Text style={styles.emptyParticipants}>No participants yet.</Text>
                    ) : (
                      participants.map((p) => (
                        <View key={p.player_id} style={styles.participantRow}>
                          <Pressable
                            onPress={() => router.push(`/player-profile/${p.player_id}`)}
                            style={({ pressed }) => [
                              styles.participantProfileTrigger,
                              pressed && styles.participantProfileTriggerPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${p.username}'s profile`}
                          >
                            <View style={styles.participantAvatar}>
                              <Text style={styles.participantAvatarText}>
                                {(p.username || '?').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.participantInfo}>
                              <View style={styles.participantNameRow}>
                                <Text style={styles.participantName}>{p.username}</Text>
                                {lobby && p.player_id === lobby.host_user_id && (
                                  <MaterialCommunityIcons
                                    name="crown"
                                    size={18}
                                    color={RUTGERS_RED}
                                    style={styles.hostIcon}
                                  />
                                )}
                              </View>
                              {(p.current_team || p.is_ready) && (
                                <Text style={styles.participantMeta}>
                                  {[p.current_team, p.is_ready ? 'Ready' : null]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        ) : null}
      </View>

      <Modal
        visible={calendarPromptOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCalendarPromptOpen(false)}
      >
        <View style={styles.centeredModalBackdrop}>
          <View style={styles.centeredModalCard}>
            <Text style={styles.modalTitle}>Add to Calendar</Text>
            <Text style={styles.modalMessage}>
              Would you like to add this lobby to your Google Calendar?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setCalendarPromptOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  setCalendarPromptOpen(false);
                  void openLobbyInGoogleCalendar();
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>Sure</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={joinPasswordModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setJoinPasswordModalOpen(false);
          setJoinUnlockError(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter lobby password</Text>
            {joinUnlockError ? <Text style={styles.errorText}>{joinUnlockError}</Text> : null}

            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordRow, styles.unlockInput]}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={joinPassword}
                onChangeText={setJoinPassword}
                placeholder="Lobby password"
                placeholderTextColor={MUTED_TEXT}
                secureTextEntry={!showJoinPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!joinUnlockBusy}
              />
              <Pressable
                onPress={() => setShowJoinPassword((v) => !v)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <MaterialIcons
                  name={showJoinPassword ? 'visibility' : 'visibility-off'}
                  size={20}
                  color={MUTED_TEXT}
                />
              </Pressable>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setJoinPasswordModalOpen(false);
                  setJoinUnlockError(null);
                }}
                disabled={joinUnlockBusy}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  joinUnlockBusy && styles.primaryButtonDisabled,
                ]}
                onPress={() => void handleUnlockWithPasswordAndJoin()}
                disabled={joinUnlockBusy || !joinPassword.trim()}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>
                  {joinUnlockBusy ? 'Unlocking…' : 'Unlock & join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editOpen}
        animationType="slide"
        transparent
        onRequestClose={closeEdit}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.modalTitle}>Edit lobby</Text>
            {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

            <Text style={styles.label}>Lobby name</Text>
            <TextInput
              style={styles.input}
              value={editLobbyName}
              onChangeText={setEditLobbyName}
              placeholder="Lobby name"
              placeholderTextColor={MUTED_TEXT}
            />

            <Text style={styles.label}>Sport</Text>
            <View style={styles.pillRow}>
              {SPORT_OPTIONS.map((option) => {
                const selected = editSport === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => {
                      setEditSport(option);
                      setEditLocationId(null);
                      setEditSelectedSlot(null);
                      setEditMaxPlayers(String(maxPlayersForSport(option)));
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Location</Text>
            <TouchableOpacity
              style={styles.locationSelectButton}
              onPress={() => setEditLocationPickerOpen(true)}
              activeOpacity={0.9}
            >
              {editSelectedLocation ? (
                <View style={styles.locationSelectContent}>
                  <Text
                    style={[styles.locationSelectCampus, { color: getCampusColor(editSelectedLocation.campus) }]}
                  >
                    {editSelectedLocation.campus}
                  </Text>
                  <Text style={styles.locationSelectName}>{editSelectedLocation.name}</Text>
                  <Text style={styles.locationSelectAddress}>{editSelectedLocation.address}</Text>
                </View>
              ) : (
                <Text style={styles.locationSelectPlaceholder}>Select location…</Text>
              )}
            </TouchableOpacity>
            {editLocations.length === 0 ? (
              <Text style={styles.mutedTextSmall}>
                {editSport.trim() ? `No ${editSport} courts found.` : 'No locations available.'}
              </Text>
            ) : null}

            <Modal
              visible={editLocationPickerOpen}
              transparent
              animationType="slide"
              onRequestClose={() => setEditLocationPickerOpen(false)}
            >
              <View style={styles.locationPickerBackdrop}>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => setEditLocationPickerOpen(false)}
                />
                <View style={styles.locationPickerCard}>
                  <Text style={styles.locationPickerTitle}>
                    {editSport.trim() ? `Select ${editSport} court` : 'Select location'}
                  </Text>
                  <ScrollView
                    style={styles.locationPickerScroll}
                    contentContainerStyle={styles.locationPickerScrollContent}
                  >
                    {editLocations.map((loc) => (
                      <TouchableOpacity
                        key={loc.location_id}
                        style={[
                          styles.locationPickerRow,
                          editLocationId === loc.location_id && styles.locationPickerRowSelected,
                        ]}
                        onPress={() => {
                          setEditLocationId(loc.location_id);
                          setEditLocationPickerOpen(false);
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.locationPickerCampus, { color: getCampusColor(loc.campus) }]}>
                          {loc.campus}
                        </Text>
                        <Text style={styles.locationPickerName}>{loc.name}</Text>
                        <Text style={styles.locationPickerAddress}>{loc.address}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.locationPickerDone}
                    onPress={() => setEditLocationPickerOpen(false)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.locationPickerDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            <Text style={styles.label}>Reserve time slot</Text>
            <Text style={styles.mutedTextSmall}>
              Choose a date, then select an open 30-minute slot. Booked slots are blocked for the
              selected court.
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayScroller}
            >
              {editReservationDays.map((day) => {
                const selected = dateKey(day) === dateKey(editSelectedDay);
                return (
                  <TouchableOpacity
                    key={dateKey(day)}
                    style={[styles.dayCard, selected && styles.dayCardSelected]}
                    onPress={() => {
                      setEditSelectedDay(day);
                      setEditSelectedSlot(null);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.dayCardText, selected && styles.dayCardTextSelected]}>
                      {formatDayChip(day)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.slotLegendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotOpen]} />
                <Text style={styles.legendText}>Open</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotSelected]} />
                <Text style={styles.legendText}>Selected</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotBooked]} />
                <Text style={styles.legendText}>Booked</Text>
              </View>
            </View>

            <View style={styles.slotListCard}>
              {!editLocationId ? (
                <Text style={styles.slotHelpText}>
                  Select a location first to view available time slots.
                </Text>
              ) : (
                editAvailableTimeSlots.map((slotDate) => {
                  const key = slotKey(slotDate);
                  const isPast = slotDate.getTime() <= Date.now();
                  const isBooked = editBookedSlotKeys.has(key);
                  const isSelected = editSelectedSlot ? slotKey(editSelectedSlot) === key : false;
                  const disabled = isPast || isBooked;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.timeSlotRow,
                        isSelected && styles.timeSlotRowSelected,
                        disabled && styles.timeSlotRowDisabled,
                      ]}
                      disabled={disabled}
                      onPress={() => {
                        setEditSelectedSlot(slotDate);
                        setEditScheduledAt(slotDate);
                      }}
                      activeOpacity={0.9}
                    >
                      <View>
                        <Text
                          style={[
                            styles.timeSlotTime,
                            isSelected && styles.timeSlotTimeSelected,
                            disabled && styles.timeSlotTimeDisabled,
                          ]}
                        >
                          {formatSlotTime(slotDate)}
                        </Text>
                        <Text
                          style={[
                            styles.timeSlotSubtext,
                            isSelected && styles.timeSlotSubtextSelected,
                          ]}
                        >
                          30 minute reservation
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.timeSlotStatusPill,
                          isSelected && styles.timeSlotStatusSelected,
                          disabled && styles.timeSlotStatusDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.timeSlotStatusText,
                            isSelected && styles.timeSlotStatusTextSelected,
                            disabled && styles.timeSlotStatusTextDisabled,
                          ]}
                        >
                          {isBooked ? 'Booked' : isPast ? 'Past' : isSelected ? 'Selected' : 'Open'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {editSelectedSlot && editSelectedLocation ? (
              <View style={styles.reservationSummaryCard}>
                <Text style={styles.reservationSummaryLabel}>Selected reservation</Text>
                <Text style={styles.reservationSummaryTitle}>{editSelectedLocation.name}</Text>
                <Text style={styles.reservationSummaryText}>
                  {formatReservationSummary(editSelectedSlot)}
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>Max players</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={editMaxPlayers}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
                setEditMaxPlayers(cleaned);
              }}
              maxLength={2}
            />
            <Text style={styles.mutedTextSmall}>
              Between 2 and {editSport.trim() ? maxPlayersForSport(editSport) : 50} players.
            </Text>

            <Text style={styles.label}>Minimum ELO</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={editMinElo}
              onChangeText={setEditMinElo}
              placeholder="0"
              placeholderTextColor={MUTED_TEXT}
            />
            <Text style={styles.mutedTextSmall}>
              {editSport.trim()
                ? `Cannot exceed your ${editSport.trim()} ELO (${myEloForEditSport ?? 400}).`
                : 'Select a sport to see your ELO cap.'}
            </Text>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Public lobby</Text>
              <Switch
                value={editIsPublic}
                onValueChange={(v) => {
                  setEditIsPublic(v);
                  if (v) {
                    setEditPrivatePassword('');
                    setEditPrivatePasswordConfirm('');
                  }
                }}
              />
            </View>

            {!editIsPublic ? (
              <>
                <Text style={styles.label}>
                  {initialEditWasPublic ? 'Lobby password' : 'New password (optional)'}
                </Text>
                <Text style={styles.mutedTextSmall}>
                  {initialEditWasPublic
                    ? 'Required while switching from public to private.'
                    : 'Leave blank to keep the current password. Enter a new password to change it.'}
                </Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={editPrivatePassword}
                    onChangeText={setEditPrivatePassword}
                    placeholder="At least 4 characters"
                    placeholderTextColor={MUTED_TEXT}
                    secureTextEntry={!showEditPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    onPress={() => setShowEditPassword((v) => !v)}
                    style={styles.eyeButton}
                    hitSlop={8}
                  >
                    <MaterialIcons
                      name={showEditPassword ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={MUTED_TEXT}
                    />
                  </Pressable>
                </View>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={editPrivatePasswordConfirm}
                    onChangeText={setEditPrivatePasswordConfirm}
                    placeholder="Re-enter password"
                    placeholderTextColor={MUTED_TEXT}
                    secureTextEntry={!showEditPasswordConfirm}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    onPress={() => setShowEditPasswordConfirm((v) => !v)}
                    style={styles.eyeButton}
                    hitSlop={8}
                  >
                    <MaterialIcons
                      name={showEditPasswordConfirm ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={MUTED_TEXT}
                    />
                  </Pressable>
                </View>
              </>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={closeEdit}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
                onPress={handleSaveEdit}
                disabled={saving}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: RUTGERS_RED,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 10,
    elevation: 10,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  mutedTextSmall: {
    marginTop: 4,
    marginBottom: 8,
    color: MUTED_TEXT,
    fontSize: 12,
  },
  errorText: {
    color: '#F97373',
    fontSize: 14,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
  },
  lobbyName: {
    fontSize: 22,
    fontWeight: '700',
    color: DARK_NAVY,
    marginBottom: 4,
  },
  sport: {
    fontSize: 16,
    color: MUTED_TEXT,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    color: DARK_NAVY,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'nowrap',
    gap: 10,
    marginTop: 8,
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
  metaText: {
    fontSize: 13,
    color: MUTED_TEXT,
    textAlign: 'right',
  },
  metaRightCol: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
    gap: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tabBtnTextActive: {
    color: DARK_NAVY,
  },
  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    padding: 14,
    gap: 10,
  },
  aboutThumbTop: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EEF2F7',
  },
  aboutHeroTextWrap: {
    justifyContent: 'center',
    marginTop: 2,
  },
  aboutThumb: {
    width: '100%',
    height: '100%',
  },
  aboutHeroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  aboutSportRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  aboutSportText: {
    fontSize: 13,
    color: MUTED_TEXT,
    fontWeight: '600',
  },
  aboutInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aboutValue: {
    fontSize: 14,
    color: DARK_NAVY,
    fontWeight: '500',
  },
  aboutLinkValue: {
    fontSize: 14,
    color: RUTGERS_RED,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  mapCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapCardTextWrap: {
    flex: 1,
  },
  mapCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  mapCardSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED_TEXT,
  },
  createMatchButton: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  createMatchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: RUTGERS_RED,
  },
  joinButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.7,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: RUTGERS_RED,
  },
  leaveButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  leaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  participantList: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    overflow: 'hidden',
  },
  emptyParticipants: {
    padding: 20,
    fontSize: 14,
    color: MUTED_TEXT,
    textAlign: 'center',
  },
  participantRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GRAY,
  },
  participantProfileTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantProfileTriggerPressed: {
    opacity: 0.75,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RUTGERS_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  participantAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hostIcon: {
    marginLeft: 4,
  },
  participantMeta: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginTop: 2,
  },
  hostActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: RUTGERS_RED,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: RUTGERS_RED,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#B91C1C',
    paddingVertical: 12,
    borderRadius: 14,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  centeredModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  modalCard: {
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  modalScroll: {
    maxHeight: '100%',
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DARK_NAVY,
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: DARK_NAVY,
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_NAVY,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: LIGHT_GRAY,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    fontSize: 14,
    color: DARK_NAVY,
  },
  unlockInput: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_GRAY,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: LIGHT_GRAY,
  },
  pillSelected: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204, 0, 51, 0.10)',
  },
  pillText: {
    fontSize: 13,
    color: DARK_NAVY,
  },
  pillTextSelected: {
    color: RUTGERS_RED,
    fontWeight: '700',
  },
  locationSelectButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: LIGHT_GRAY,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    justifyContent: 'center',
  },
  locationSelectContent: {
    gap: 2,
  },
  locationSelectCampus: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  locationSelectName: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  locationSelectAddress: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginTop: 2,
  },
  locationSelectPlaceholder: {
    fontSize: 14,
    color: MUTED_TEXT,
  },
  locationPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  locationPickerCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  locationPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DARK_NAVY,
    marginBottom: 12,
  },
  locationPickerScroll: {
    maxHeight: 320,
  },
  locationPickerScrollContent: {
    paddingBottom: 12,
  },
  locationPickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  locationPickerRowSelected: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204, 0, 51, 0.08)',
  },
  locationPickerName: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  locationPickerCampus: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  locationPickerAddress: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginTop: 2,
  },
  locationPickerDone: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: DARK_NAVY,
  },
  locationPickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dateButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: LIGHT_GRAY,
  },
  dateButtonText: {
    fontSize: 14,
    color: DARK_NAVY,
  },
  dayScroller: {
    gap: 8,
    paddingVertical: 4,
  },
  dayCard: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dayCardSelected: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204, 0, 51, 0.10)',
  },
  dayCardText: {
    fontSize: 13,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  dayCardTextSelected: {
    color: RUTGERS_RED,
  },
  slotLegendRow: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDotOpen: {
    backgroundColor: '#22C55E',
  },
  legendDotSelected: {
    backgroundColor: RUTGERS_RED,
  },
  legendDotBooked: {
    backgroundColor: '#9CA3AF',
  },
  legendText: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED_TEXT,
  },
  slotListCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  slotHelpText: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: MUTED_TEXT,
  },
  timeSlotRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GRAY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  timeSlotRowSelected: {
    backgroundColor: 'rgba(204, 0, 51, 0.08)',
  },
  timeSlotRowDisabled: {
    backgroundColor: '#F3F4F6',
  },
  timeSlotTime: {
    fontSize: 15,
    fontWeight: '800',
    color: DARK_NAVY,
  },
  timeSlotTimeSelected: {
    color: RUTGERS_RED,
  },
  timeSlotTimeDisabled: {
    color: MUTED_TEXT,
  },
  timeSlotSubtext: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED_TEXT,
  },
  timeSlotSubtextSelected: {
    color: DARK_NAVY,
  },
  timeSlotStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  timeSlotStatusSelected: {
    backgroundColor: RUTGERS_RED,
  },
  timeSlotStatusDisabled: {
    backgroundColor: '#E5E7EB',
  },
  timeSlotStatusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  timeSlotStatusTextSelected: {
    color: '#FFFFFF',
  },
  timeSlotStatusTextDisabled: {
    color: MUTED_TEXT,
  },
  reservationSummaryCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 51, 0.20)',
    backgroundColor: 'rgba(204, 0, 51, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reservationSummaryLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: RUTGERS_RED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reservationSummaryTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: DARK_NAVY,
  },
  reservationSummaryText: {
    marginTop: 2,
    fontSize: 13,
    color: MUTED_TEXT,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 14,
    color: DARK_NAVY,
    fontWeight: '500',
  },
  primaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: DARK_NAVY,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
