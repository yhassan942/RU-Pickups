/**
 * Lobbies discovery and creation screen with filtering, pagination, and slot booking UX.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { API_BASE_URL, authedFetch, getAccessToken } from '@/api/backend';

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
  participant_average_elo?: number | null;
  participant_details_hidden?: boolean;
  min_elo?: number;
};

type Location = {
  location_id: string;
  name: string;
  campus: string;
  address: string;
};

const CAMPUS_COLORS: Record<string, string> = {
  'College Ave': '#CC0033',
  Busch: '#0054A4',
  Livingston: '#2E7D32',
  'Cook/Douglass': '#E65100',
};
function getCampusColor(campus: string): string {
  return CAMPUS_COLORS[campus] ?? '#6B7280';
}

function normalizeCampus(campus: string): string {
  const compact = campus.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (compact === 'collegeavenue' || compact === 'collegeave' || compact === 'ca') {
    return 'collegeave';
  }
  if (compact === 'cookdouglass' || compact === 'cookanddouglass' || compact === 'cd') {
    return 'cookdouglass';
  }
  return compact;
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
type TimeFilter = 'any' | 'upcoming' | 'past';
const LOBBIES_PAGE_SIZE = 8;
const SLOT_INTERVAL_MINUTES = 30;
const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 23;

const CAMPUS_IMAGES = {
  collegeave: require('../photos/CollegeAve.jpg'),
  cookdouglass: require('../photos/Cook:Douglass.jpg'),
  livingston: require('../photos/Livingston.jpg'),
  busch: require('../photos/Busch.jpg'),
} as const;

function getCampusThumbnail(campus: string | undefined | null) {
  const key = normalizeCampus(campus ?? '');
  if (key === 'collegeave') return CAMPUS_IMAGES.collegeave;
  if (key === 'cookdouglass') return CAMPUS_IMAGES.cookdouglass;
  if (key === 'livingston') return CAMPUS_IMAGES.livingston;
  if (key === 'busch') return CAMPUS_IMAGES.busch;
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

function maxPlayersForSport(sport: string): number {
  const hit = SPORT_OPTIONS.find((s) => s === sport.trim());
  return hit ? SPORT_MAX_PLAYERS[hit] : 50;
}

function humanizeStatus(status: string): string {
  const raw = status.trim();
  if (!raw) return 'Unknown';
  return raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}


function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function slotKey(date: Date): string {
  return `${dateKey(date)}-${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function formatDayChip(date: Date): string {
  const today = startOfDay(new Date()).getTime();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = startOfDay(date).getTime();
  const label = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (target === today) return `Today · ${label}`;
  if (target === startOfDay(tomorrow).getTime()) return `Tomorrow · ${label}`;
  return label;
}

function formatSlotTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatReservationSummary(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildTimeSlotsForDay(day: Date): Date[] {
  const slots: Date[] = [];
  const current = new Date(day);
  current.setHours(SLOT_START_HOUR, 0, 0, 0);
  const end = new Date(day);
  end.setHours(SLOT_END_HOUR, 0, 0, 0);
  while (current < end) {
    slots.push(new Date(current));
    current.setMinutes(current.getMinutes() + SLOT_INTERVAL_MINUTES);
  }
  return slots;
}


export default function LobbiesScreen() {
  const router = useRouter();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [lobbyName, setLobbyName] = useState<string>('');
  const [sport, setSport] = useState<string>('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState<string>('10');
  const [minEloInput, setMinEloInput] = useState<string>('');
  const [sportEloBySport, setSportEloBySport] = useState<Record<string, number>>({});
  const [myLobbyIds, setMyLobbyIds] = useState<Set<string>>(new Set());
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [lobbyPassword, setLobbyPassword] = useState('');
  const [lobbyPasswordConfirm, setLobbyPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [sportFilters, setSportFilters] = useState<string[]>([]);
  const [campusFilters, setCampusFilters] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('any');
  const [openFilter, setOpenFilter] = useState<'sport' | 'campus' | 'time' | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const lobbiesRes = token
          ? await authedFetch('/lobbies')
          : await fetch(`${API_BASE_URL}/lobbies`);

        if (!lobbiesRes.ok) {
          throw new Error(`Failed to load lobbies (${lobbiesRes.status})`);
        }

        const lobbiesData: Lobby[] = await lobbiesRes.json();
        setLobbies(
          lobbiesData.sort(
            (a, b) =>
              new Date(a.scheduled_start_time).getTime() -
              new Date(b.scheduled_start_time).getTime(),
          ),
        );

        void (async () => {
          try {
            const locationsRes = await fetch(`${API_BASE_URL}/locations/location_manifest`);
            if (locationsRes.ok) {
              const locationsData: Location[] = await locationsRes.json();
              setLocations(locationsData);
            }
          } catch {
            // ignore location errors for the main lobbies list
          }
        })();

        void (async () => {
          try {
            const [meRes, sportStatsRes, myUpcomingRes] = await Promise.all([
              authedFetch('/users/me'),
              authedFetch('/users/me/sport-stats'),
              authedFetch('/lobbies/my/upcoming'),
            ]);
            if (meRes.ok) {
              const me = (await meRes.json()) as { user_id: string };
              setCurrentUserId(me.user_id);
            }
            if (sportStatsRes.ok) {
              const rows = (await sportStatsRes.json()) as {
                sport: string;
                elo: number;
              }[];
              const map: Record<string, number> = {};
              for (const r of rows) {
                if (r.sport && typeof r.elo === 'number') map[r.sport] = r.elo;
              }
              setSportEloBySport(map);
            }
            if (myUpcomingRes.ok) {
              const myLobbies = (await myUpcomingRes.json()) as { lobby_id: string }[];
              setMyLobbyIds(new Set(myLobbies.map((l) => l.lobby_id)));
            }
          } catch {
            // ignore user loading errors; lobbies list still works
          }
        })();
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('Failed to load lobbies.');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const resetCreateState = () => {
    setLobbyName('');
    setSport('');
    setLocationId(null);
    setMaxPlayers('10');
    setMinEloInput('');
    setIsPublic(true);
    setLobbyPassword('');
    setLobbyPasswordConfirm('');
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setSelectedDay(startOfDay(new Date()));
    setSelectedSlot(null);
    setCreateError(null);
    setLocationPickerOpen(false);
  };

  const openCreate = () => {
    resetCreateState();
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const locationForLobby = (lobby: Lobby): Location | undefined =>
    locations.find((loc) => loc.location_id === lobby.location_id);

  const campusForLobby = (lobby: Lobby): string => {
    const locationCampus = locationForLobby(lobby)?.campus?.trim();
    if (locationCampus) return locationCampus;
    return lobby.campus?.trim() ?? '';
  };

  const createLocations = useMemo(
    () => locations.filter((loc) => locationMatchesSport(loc, sport)),
    [locations, sport],
  );

  const selectedLocation = locationId
    ? createLocations.find((loc) => loc.location_id === locationId) ??
      locations.find((loc) => loc.location_id === locationId) ??
      null
    : null;

  const reservationDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = startOfDay(new Date());
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );

  const availableTimeSlots = useMemo(() => buildTimeSlotsForDay(selectedDay), [selectedDay]);

  const bookedSlotKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!locationId) return keys;

    for (const lobby of lobbies) {
      if (lobby.location_id !== locationId) continue;
      const status = lobby.status.toLowerCase();
      if (status === 'cancelled' || status === 'completed') continue;

      const start = new Date(lobby.scheduled_start_time);
      if (!Number.isNaN(start.getTime())) keys.add(slotKey(start));
    }

    return keys;
  }, [lobbies, locationId]);

  useEffect(() => {
    if (!locationId) return;
    const stillValid = createLocations.some((loc) => loc.location_id === locationId);
    if (!stillValid) {
      setLocationId(null);
      setSelectedSlot(null);
    }
  }, [locationId, createLocations]);

  const toggleSportFilter = useCallback((value: string) => {
    setSportFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const toggleCampusFilter = useCallback((value: string) => {
    setCampusFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const filteredLobbies = useMemo(() => {
    const now = new Date();
    return lobbies.filter((lobby) => {
      if (sportFilters.length > 0 && !sportFilters.includes(lobby.sport)) return false;
      if (campusFilters.length > 0) {
        const lobbyCampus = normalizeCampus(campusForLobby(lobby));
        const campusMatch = campusFilters.some(
          (selectedCampus) => normalizeCampus(selectedCampus) === lobbyCampus,
        );
        if (!campusMatch) return false;
      }
      if (timeFilter === 'upcoming') {
        return new Date(lobby.scheduled_start_time).getTime() >= now.getTime();
      }
      if (timeFilter === 'past') {
        return new Date(lobby.scheduled_start_time).getTime() < now.getTime();
      }
      return true;
    });
  }, [lobbies, locations, sportFilters, campusFilters, timeFilter]);

  const sportFilterLabel =
    sportFilters.length === 0
      ? 'Any'
      : sportFilters.length === 1
        ? sportFilters[0]
        : `${sportFilters.length} selected`;
  const campusFilterLabel =
    campusFilters.length === 0
      ? 'Any'
      : campusFilters.length === 1
        ? campusFilters[0]
        : `${campusFilters.length} selected`;

  const totalPages = Math.max(1, Math.ceil(filteredLobbies.length / LOBBIES_PAGE_SIZE));
  const paginatedLobbies = useMemo(() => {
    const start = (page - 1) * LOBBIES_PAGE_SIZE;
    return filteredLobbies.slice(start, start + LOBBIES_PAGE_SIZE);
  }, [filteredLobbies, page]);

  useEffect(() => {
    setPage(1);
  }, [sportFilters, campusFilters, timeFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const myEloForSelectedSport = useMemo(() => {
    const s = sport.trim();
    if (!s) return null;
    const v = sportEloBySport[s];
    return typeof v === 'number' ? v : 400;
  }, [sport, sportEloBySport]);

  const handleCreateLobby = async () => {
    setCreateError(null);

    const trimmedLobbyName = lobbyName.trim();
    const trimmedSport = sport.trim();
    if (!trimmedLobbyName) {
      setCreateError('Please enter a lobby name.');
      return;
    }
    const max = parseInt(maxPlayers, 10);

    if (!trimmedSport) {
      setCreateError('Please select a sport.');
      return;
    }
    if (!locationId || !selectedLocation) {
      setCreateError('Please select a location.');
      return;
    }
    if (Number.isNaN(max) || max < 2) {
      setCreateError('Max players must be a number of at least 2.');
      return;
    }
    const sportCap = maxPlayersForSport(trimmedSport);
    if (max > sportCap) {
      setCreateError(`${trimmedSport} lobbies can have at most ${sportCap} players.`);
      return;
    }

    const minEloTrim = minEloInput.trim();
    let minElo = 0;
    if (minEloTrim !== '') {
      minElo = parseInt(minEloTrim, 10);
      if (Number.isNaN(minElo) || minElo < 0) {
        setCreateError('Minimum ELO must be a non-negative whole number.');
        return;
      }
      const cap =
        typeof sportEloBySport[trimmedSport] === 'number'
          ? sportEloBySport[trimmedSport]
          : 400;
      if (minElo > cap) {
        setCreateError(
          `Minimum ELO cannot be higher than your ${trimmedSport} ELO (${cap}).`,
        );
        return;
      }
    }

    if (!selectedSlot) {
      setCreateError('Please select an available reservation time slot.');
      return;
    }
    if (selectedSlot.getTime() <= Date.now()) {
      setCreateError('Reservation time must be in the future.');
      return;
    }
    if (bookedSlotKeys.has(slotKey(selectedSlot))) {
      setCreateError(
        'That court is already booked for this time slot. Please choose another slot.',
      );
      return;
    }

    if (!isPublic) {
      const p = lobbyPassword.trim();
      const c = lobbyPasswordConfirm.trim();
      if (p.length < 4) {
        setCreateError('Private lobbies need a password of at least 4 characters.');
        return;
      }
      if (p !== c) {
        setCreateError('Password and confirmation do not match.');
        return;
      }
    }

    if (creating) return;
    setCreating(true);

    try {
      const body: Record<string, unknown> = {
        lobby_name: trimmedLobbyName,
        sport: trimmedSport,
        campus: selectedLocation.campus,
        location_id: locationId,
        is_public: isPublic,
        max_players: max,
        min_elo: minElo,
        scheduled_start_time: selectedSlot.toISOString(),
      };
      if (!isPublic) {
        body.lobby_password = lobbyPassword.trim();
      }

      const res = await authedFetch('/lobbies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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
        throw new Error(msg || `Failed to create lobby (${res.status})`);
      }

      const created: Lobby = await res.json();
      const createdWithCount: Lobby = {
        ...created,
        participant_count: created.participant_count ?? 1,
      };

      setLobbies((prev) =>
        [createdWithCount, ...prev].sort(
          (a, b) =>
            new Date(a.scheduled_start_time).getTime() -
            new Date(b.scheduled_start_time).getTime(),
        ),
      );
      closeCreate();
    } catch (e) {
      if (e instanceof Error) {
        setCreateError(e.message);
      } else {
        setCreateError('Failed to create lobby.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.heading}>Browse Pickup Games</Text>
            <Text style={styles.subheading}>Find a court, time, and crew.</Text>
          </View>
          <TouchableOpacity style={styles.createButton} onPress={openCreate} activeOpacity={0.9}>
            <Text style={styles.createButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.filterHeaderRow}>
            <Text style={styles.filterLabel}>Filters</Text>
            <TouchableOpacity
              style={styles.addFilterButton}
              onPress={() => {
                setSportFilters([]);
                setCampusFilters([]);
                setTimeFilter('any');
                setOpenFilter(null);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.addFilterText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterChipsRow}>
            <TouchableOpacity
              style={[styles.filterChip, openFilter === 'sport' && styles.filterChipActive]}
              onPress={() => setOpenFilter((prev) => (prev === 'sport' ? null : 'sport'))}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, openFilter === 'sport' && styles.filterChipTextActive]}>
                Sport: {sportFilterLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, openFilter === 'campus' && styles.filterChipActive]}
              onPress={() => setOpenFilter((prev) => (prev === 'campus' ? null : 'campus'))}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.filterChipText, openFilter === 'campus' && styles.filterChipTextActive]}
              >
                Campus: {campusFilterLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, openFilter === 'time' && styles.filterChipActive]}
              onPress={() => setOpenFilter((prev) => (prev === 'time' ? null : 'time'))}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, openFilter === 'time' && styles.filterChipTextActive]}>
                Time: {timeFilter === 'any' ? 'Any' : timeFilter === 'upcoming' ? 'Upcoming' : 'Past'}
              </Text>
            </TouchableOpacity>
          </View>

          {openFilter && (
            <View style={styles.filterOptionsPanel}>
              <Text style={styles.filterPanelTitle}>
                {openFilter === 'sport'
                  ? 'Choose sport'
                  : openFilter === 'campus'
                    ? 'Choose campus'
                    : 'Choose time'}
              </Text>

              <View style={styles.filterPanelRow}>
                {openFilter === 'sport' ? (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.filterOption,
                        sportFilters.length === 0 && styles.filterOptionSelected,
                      ]}
                      onPress={() => setSportFilters([])}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          sportFilters.length === 0 && styles.filterOptionTextSelected,
                        ]}
                      >
                        Any sport
                      </Text>
                    </TouchableOpacity>
                    {SPORT_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.filterOption,
                          sportFilters.includes(option) && styles.filterOptionSelected,
                        ]}
                        onPress={() => toggleSportFilter(option)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            sportFilters.includes(option) && styles.filterOptionTextSelected,
                          ]}
                        >
                          {option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : openFilter === 'campus' ? (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.filterOption,
                        campusFilters.length === 0 && styles.filterOptionSelected,
                      ]}
                      onPress={() => setCampusFilters([])}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          campusFilters.length === 0 && styles.filterOptionTextSelected,
                        ]}
                      >
                        Any campus
                      </Text>
                    </TouchableOpacity>
                    {Object.keys(CAMPUS_COLORS).map((campus) => (
                      <TouchableOpacity
                        key={campus}
                        style={[
                          styles.filterOption,
                          campusFilters.includes(campus) && styles.filterOptionSelected,
                        ]}
                        onPress={() => toggleCampusFilter(campus)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            campusFilters.includes(campus) && styles.filterOptionTextSelected,
                          ]}
                        >
                          {campus}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.filterOption, timeFilter === 'any' && styles.filterOptionSelected]}
                      onPress={() => setTimeFilter('any')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          timeFilter === 'any' && styles.filterOptionTextSelected,
                        ]}
                      >
                        Any time
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.filterOption,
                        timeFilter === 'upcoming' && styles.filterOptionSelected,
                      ]}
                      onPress={() => setTimeFilter('upcoming')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          timeFilter === 'upcoming' && styles.filterOptionTextSelected,
                        ]}
                      >
                        Upcoming only
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterOption, timeFilter === 'past' && styles.filterOptionSelected]}
                      onPress={() => setTimeFilter('past')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          timeFilter === 'past' && styles.filterOptionTextSelected,
                        ]}
                      >
                        Past only
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <View style={styles.filterPanelActions}>
                <TouchableOpacity
                  style={styles.doneFiltersButton}
                  onPress={() => setOpenFilter(null)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.doneFiltersText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#CC0033" />
            <Text style={styles.mutedText}>Loading lobbies...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : filteredLobbies.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No lobbies yet</Text>
            <Text style={styles.mutedText}>
              Be the first to host a game — tap &quot;Create lobby&quot;.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {paginatedLobbies.map((lobby) => {
              const loc = locationForLobby(lobby);
              const when = new Date(lobby.scheduled_start_time);
              const timeLabel = when.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              });
              const dateLabel = when.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const campusLabel = campusForLobby(lobby) || 'Campus TBD';
              const imageSource = getCampusThumbnail(campusLabel);
              const lobbyStatus = lobby.status.toLowerCase();
              const isHost = currentUserId === lobby.host_user_id;
              const isMyLobby = isHost || myLobbyIds.has(lobby.lobby_id);
              const isInProgress = lobbyStatus === 'in_progress';
              const canOpenLobby = !(isInProgress && !isMyLobby);

              return (
                <Pressable
                  key={lobby.lobby_id}
                  style={({ pressed }) => [
                    styles.lobbyCard,
                    !canOpenLobby && styles.lobbyCardDisabled,
                    pressed && canOpenLobby && styles.lobbyCardPressed,
                  ]}
                  onPress={() => {
                    if (!canOpenLobby) return;
                    router.push(`/lobby/${lobby.lobby_id}`);
                  }}
                >
                  <Image source={imageSource} style={styles.campusThumb} />
                  <View style={styles.lobbyMain}>
                    <View style={styles.lobbyTopRow}>
                      <View style={styles.lobbyTitleWrap}>
                        <Text style={styles.lobbyName} numberOfLines={1}>
                          {lobby.lobby_name}
                        </Text>
                        <Text style={styles.lobbySubline} numberOfLines={1}>
                          {loc?.name || campusLabel}
                        </Text>
                        <View style={styles.sportMetaRow}>
                          <View style={styles.sportChip}>
                            <MaterialIcons
                              name={sportIconFor(lobby.sport)}
                              size={13}
                              color={DARK_NAVY}
                            />
                            <Text style={styles.sportChipText} numberOfLines={1}>
                              {lobby.sport}
                            </Text>
                          </View>
                          <Text style={styles.lobbyMetaLine} numberOfLines={1}>
                            {campusLabel}
                          </Text>
                        </View>
                        {lobby.participant_details_hidden ? (
                          <Text style={styles.lobbyMetaLine} numberOfLines={1}>
                            Roster hidden
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.rightCol}>
                        <Text style={styles.timeText}>{timeLabel}</Text>
                        <Text style={styles.dateText}>{dateLabel}</Text>
                        {!lobby.participant_details_hidden ? (
                          <View style={styles.playersRow}>
                            <MaterialIcons name="group" size={14} color={MUTED_TEXT} />
                            <Text style={styles.playersText}>
                              {lobby.participant_count ?? 0}/{lobby.max_players}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.bottomRow}>
                      <Text style={styles.mutedInline}>
                        {lobby.is_public ? 'Public' : 'Private'} · Min ELO {lobby.min_elo ?? 0}
                        {isHost ? ' · Host' : ''}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          isHost && styles.statusPillHost,
                          lobbyStatus !== 'open' && styles.statusPillMuted,
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {isHost ? 'Host' : humanizeStatus(lobby.status)}
                        </Text>
                      </View>
                    </View>
                    {lobby.participant_details_hidden !== true && lobby.participant_average_elo != null ? (
                      <Text style={styles.avgEloText}>
                        Avg ELO {Math.round(lobby.participant_average_elo)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {filteredLobbies.length > LOBBIES_PAGE_SIZE ? (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pageBtnText}>Previous</Text>
                </TouchableOpacity>
                <Text style={styles.pageText}>
                  Page {page} of {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pageBtnText}>Next</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>

      <Modal
        visible={createOpen}
        animationType="slide"
        transparent
        onRequestClose={closeCreate}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Create a lobby</Text>
              <Text style={styles.modalSubtitle}>
                Fill in the details below — your lobby will be visible to other players right away.
              </Text>

              {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

              <Text style={styles.label}>Lobby name</Text>
              <TextInput
                style={styles.input}
                value={lobbyName}
                onChangeText={setLobbyName}
                placeholder="e.g. Friday Night Hoops"
                placeholderTextColor={MUTED_TEXT}
                maxLength={50}
                returnKeyType="next"
              />

              <Text style={styles.label}>Sport</Text>
              <View style={styles.pillRow}>
                {SPORT_OPTIONS.map((option) => {
                  const selected = sport === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.pill, selected && styles.pillSelected]}
                      onPress={() => {
                        setSport(option);
                        setMaxPlayers(String(maxPlayersForSport(option)));
                        setLocationId(null);
                        setSelectedSlot(null);
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
                onPress={() => setLocationPickerOpen(true)}
                activeOpacity={0.9}
              >
                {selectedLocation ? (
                  <View style={styles.locationSelectContent}>
                    <Text style={[styles.locationSelectCampus, { color: getCampusColor(selectedLocation.campus) }]}>
                      {selectedLocation.campus}
                    </Text>
                    <Text style={styles.locationSelectName}>{selectedLocation.name}</Text>
                    <Text style={styles.locationSelectAddress}>{selectedLocation.address}</Text>
                  </View>
                ) : (
                  <Text style={styles.locationSelectPlaceholder}>Select location…</Text>
                )}
              </TouchableOpacity>
              {createLocations.length === 0 ? (
                <Text style={styles.mutedTextSmall}>
                  {sport.trim()
                    ? `No ${sport} courts found.`
                    : 'No locations available. Please add locations in the database.'}
                </Text>
              ) : null}

              <Modal
                visible={locationPickerOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setLocationPickerOpen(false)}
              >
                <View style={styles.locationPickerBackdrop}>
                  <Pressable style={StyleSheet.absoluteFill} onPress={() => setLocationPickerOpen(false)} />
                  <View style={styles.locationPickerCard}>
                    <Text style={styles.locationPickerTitle}>
                      {sport.trim() ? `Select ${sport} court` : 'Select location'}
                    </Text>
                    <ScrollView
                      style={styles.locationPickerScroll}
                      contentContainerStyle={styles.locationPickerScrollContent}
                      keyboardShouldPersistTaps="handled"
                    >
                      {createLocations.map((loc) => {
                        const selected = locationId === loc.location_id;
                        return (
                          <TouchableOpacity
                            key={loc.location_id}
                            style={[styles.locationPickerRow, selected && styles.locationPickerRowSelected]}
                            onPress={() => {
                              setLocationId(loc.location_id);
                              setSelectedSlot(null);
                              setLocationPickerOpen(false);
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={[styles.locationPickerCampus, { color: getCampusColor(loc.campus) }]}>
                              {loc.campus}
                            </Text>
                            <Text style={styles.locationPickerName}>{loc.name}</Text>
                            <Text style={styles.locationPickerAddress}>{loc.address}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.locationPickerDone}
                      onPress={() => setLocationPickerOpen(false)}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.locationPickerDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              <Text style={styles.label}>Reserve time slot</Text>
              <Text style={styles.mutedTextSmall}>
                Choose a date, then select an open 30-minute slot. Booked slots are blocked for
                the selected court.
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayScroller}
              >
                {reservationDays.map((day) => {
                  const selected = dateKey(day) === dateKey(selectedDay);
                  return (
                    <TouchableOpacity
                      key={dateKey(day)}
                      style={[styles.dayCard, selected && styles.dayCardSelected]}
                      onPress={() => {
                        setSelectedDay(day);
                        setSelectedSlot(null);
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
                {!locationId ? (
                  <Text style={styles.slotHelpText}>
                    Select a location first to view available time slots.
                  </Text>
                ) : (
                  availableTimeSlots.map((slotDate) => {
                    const key = slotKey(slotDate);
                    const isPast = slotDate.getTime() <= Date.now();
                    const isBooked = bookedSlotKeys.has(key);
                    const isSelected = selectedSlot ? slotKey(selectedSlot) === key : false;
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
                        onPress={() => setSelectedSlot(slotDate)}
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

              {selectedSlot && selectedLocation ? (
                <View style={styles.reservationSummaryCard}>
                  <Text style={styles.reservationSummaryLabel}>Selected reservation</Text>
                  <Text style={styles.reservationSummaryTitle}>{selectedLocation.name}</Text>
                  <Text style={styles.reservationSummaryText}>
                    {formatReservationSummary(selectedSlot)}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.label}>Max players</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={maxPlayers}
                onChangeText={(text) => {
                  // Only allow digits, max 2 chars to prevent absurd values
                  const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
                  setMaxPlayers(cleaned);
                }}
                maxLength={2}
              />
              <Text style={styles.mutedTextSmall}>
                Between 2 and {sport.trim() ? maxPlayersForSport(sport) : 50} players.
              </Text>
              {sport.trim() ? (
                <Text style={styles.mutedTextSmall}>
                  {sport} cap: {maxPlayersForSport(sport)} players.
                </Text>
              ) : null}

              <Text style={styles.label}>Minimum ELO</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={minEloInput}
                onChangeText={setMinEloInput}
                placeholder="0 (default)"
                placeholderTextColor={MUTED_TEXT}
                maxLength={4}
              />
              <Text style={styles.mutedTextSmall}>
                Only players at or above this ELO can join. Leave blank for 0.
                {sport.trim()
                  ? ` Cannot exceed your ${sport.trim()} ELO (${myEloForSelectedSport ?? 400}).`
                  : ' Select a sport to see your ELO cap for this lobby.'}
              </Text>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.label}>Public lobby</Text>
                  <Text style={styles.mutedTextSmall}>
                    Anyone can see the player list and join. Private lobbies still appear in the list,
                    but players must enter the password you set to see who is in the game or join.
                  </Text>
                </View>
                <Switch value={isPublic} onValueChange={setIsPublic} />
              </View>

              {!isPublic ? (
                <>
                  <Text style={styles.label}>Lobby password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      value={lobbyPassword}
                      onChangeText={setLobbyPassword}
                      placeholder="At least 4 characters"
                      placeholderTextColor={MUTED_TEXT}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      style={styles.eyeButton}
                      hitSlop={8}
                    >
                      <MaterialIcons
                        name={showPassword ? 'visibility' : 'visibility-off'}
                        size={20}
                        color={MUTED_TEXT}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Confirm password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      value={lobbyPasswordConfirm}
                      onChangeText={setLobbyPasswordConfirm}
                      placeholder="Re-enter password"
                      placeholderTextColor={MUTED_TEXT}
                      secureTextEntry={!showPasswordConfirm}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={() => setShowPasswordConfirm((v) => !v)}
                      style={styles.eyeButton}
                      hitSlop={8}
                    >
                      <MaterialIcons
                        name={showPasswordConfirm ? 'visibility' : 'visibility-off'}
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
                  onPress={closeCreate}
                  disabled={creating}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, creating && styles.primaryButtonDisabled]}
                  onPress={handleCreateLobby}
                  disabled={creating}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryButtonText}>
                    {creating ? 'Creating…' : 'Create lobby'}
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

const RUTGERS_RED = '#CC0033';
const DARK_NAVY = '#111827';
const LIGHT_GRAY = '#F9FAFB';
const BORDER_GRAY = '#E5E7EB';
const MUTED_TEXT = '#6B7280';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: RUTGERS_RED,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: RUTGERS_RED,
  },
  filterSection: {
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  addFilterButton: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(15,23,42,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  filterChipTextActive: {
    color: DARK_NAVY,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  activeFilterChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(249,250,251,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeFilterText: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  filterOptionsPanel: {
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  filterPanelTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: DARK_NAVY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterPanelCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 4,
    marginBottom: 2,
  },
  filterPanelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.65)',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#E5E7EB',
  },
  filterOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterOptionText: {
    fontSize: 13,
    color: DARK_NAVY,
  },
  filterOptionSelected: {
    borderColor: RUTGERS_RED,
    backgroundColor: 'rgba(204, 0, 51, 0.08)',
  },
  filterOptionTextSelected: {
    color: RUTGERS_RED,
    fontWeight: '700',
  },
  filterPanelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 6,
  },
  clearFiltersButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
  },
  clearFiltersText: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  doneFiltersButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: DARK_NAVY,
  },
  doneFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.86)',
    marginTop: 4,
  },
  createButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  createButtonText: {
    color: DARK_NAVY,
    fontWeight: '700',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedText: {
    marginTop: 8,
    color: LIGHT_GRAY,
    fontSize: 14,
    textAlign: 'center',
  },
  mutedTextSmall: {
    marginTop: 4,
    color: MUTED_TEXT,
    fontSize: 12,
  },
  errorText: {
    color: '#F97373',
    fontSize: 14,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  listContent: {
    paddingBottom: 24,
  },
  lobbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_GRAY,
    borderRadius: 20,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  lobbyCardPressed: {
    opacity: 0.94,
  },
  lobbyCardDisabled: {
    opacity: 0.6,
  },
  campusThumb: {
    width: 76,
    height: 76,
    borderRadius: 14,
    marginRight: 12,
  },
  lobbyMain: {
    flex: 1,
    minWidth: 0,
  },
  lobbyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  lobbyTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  lobbyName: {
    fontSize: 16,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  lobbySubline: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 1,
  },
  lobbyMetaLine: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginTop: 3,
  },
  sportMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  sportChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  rightCol: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  dateText: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
  playersRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playersText: {
    fontSize: 14,
    fontWeight: '700',
    color: DARK_NAVY,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  mutedInline: {
    fontSize: 12,
    color: MUTED_TEXT,
    flexShrink: 1,
    paddingRight: 8,
  },
  avgEloText: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED_TEXT,
  },
  paginationRow: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  pageBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pageBtnDisabled: {
    opacity: 0.45,
  },
  pageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  pageText: {
    fontSize: 13,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  yourLobbyPill: {
    backgroundColor: 'rgba(204, 0, 51, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  yourLobbyPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: RUTGERS_RED,
  },
  lobbySport: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED_TEXT,
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
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    marginTop: 0,
  },
  metaRightCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: MUTED_TEXT,
    textAlign: 'right',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  statusPillHost: {
    backgroundColor: 'rgba(204, 0, 51, 0.16)',
  },
  statusPillMuted: {
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: DARK_NAVY,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalScrollContent: {
    paddingBottom: 8,
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
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DARK_NAVY,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: MUTED_TEXT,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_NAVY,
    marginTop: 12,
    marginBottom: 6,
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
    backgroundColor: '#F9FAFB',
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
    minHeight: 72,
    justifyContent: 'center',
  },
  locationSelectContent: {
    gap: 2,
  },
  locationSelectCampus: {
    fontSize: 14,
    fontWeight: '700',
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
    gap: 0,
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
  locationPickerCampus: {
    fontSize: 14,
    fontWeight: '700',
  },
  locationPickerName: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_NAVY,
    marginTop: 2,
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
  dayScroller: {
    paddingVertical: 8,
    gap: 8,
  },
  dayCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendDotOpen: {
    backgroundColor: '#22C55E',
  },
  legendDotSelected: {
    backgroundColor: RUTGERS_RED,
  },
  legendDotBooked: {
    backgroundColor: '#CBD5E1',
  },
  legendText: {
    fontSize: 12,
    color: MUTED_TEXT,
    fontWeight: '600',
  },
  slotListCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginTop: 4,
  },
  slotHelpText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: MUTED_TEXT,
    fontSize: 13,
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
  input: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_GRAY,
    fontSize: 14,
    color: DARK_NAVY,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
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
