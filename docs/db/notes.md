# RU Pickups Database Schema Documentation

## Overview
This database powers the RU Pickups platform, a sports pickup game management system for Rutgers University. It handles user profiles, lobby creation, matchmaking, game tracking, ELO ratings, and notifications.

## Database Technology
- **Platform**: Supabase (PostgreSQL)
- **Extension**: `pgcrypto` for secure UUID generation
- **Authentication**: Integrated with Supabase Auth

---

## Custom Types

### Enums
The database uses three custom enumerated types to ensure data consistency:

**`lobby_status`**
- `open` - Lobby is accepting new players
- `full` - Lobby has reached maximum capacity
- `in_progress` - Game is currently being played
- `completed` - Game has finished
- `cancelled` - Game was cancelled before completion

**`match_status`**
- `scheduled` - Match is planned but hasn't started
- `in_progress` - Match is currently being played
- `completed` - Match finished normally
- `forfeited` - One team forfeited the match
- `cancelled` - Match was cancelled

**`notification_type`**
- `lobby_invite` - User was invited to a lobby
- `lobby_join_request` - Someone requested to join your lobby
- `lobby_join_approved` - Your join request was approved
- `match_started` - Match has begun
- `match_completed` - Match has ended
- `match_result_reported` - Match results were submitted
- `elo_updated` - Your ELO rating changed
- `system_announcement` - Platform-wide announcement

---

## Tables

### 1. `locations`
Stores physical locations where games can be played across Rutgers campuses.

**Fields:**
- `location_id` (UUID, PK) - Unique identifier
- `name` (text) - Location name (e.g., "Werblin Recreation Center")
- `campus` (text) - Campus name (e.g., "Busch", "College Ave")
- `address` (text) - Physical address
- `latitude` / `longitude` (double precision) - GPS coordinates for mapping
- `created_at` (timestamptz) - When location was added

**Purpose**: Allows users to find and select specific courts, gyms, or fields for their games.

---

### 2. `users`
Central user profile table that extends Supabase authentication.

**Fields:**
- `user_id` (UUID, PK, FK → auth.users) - Links to Supabase auth
- `username` (text, unique) - Display name
- `preferred_campus` (text) - User's default campus
- `phone_number` (text) - Contact information
- `elo` (integer, default: 0) - Overall skill rating
- `wins` / `losses` (integer, default: 0) - Total game statistics
- `created_at` (timestamptz) - Account creation time

**Auto-Creation**: A database trigger automatically creates a user profile when someone signs up through Supabase Auth. If no username is provided, it generates one using the format `user_[first-6-chars-of-uuid]`.

**Note**: This table tracks global statistics across all sports. Sport-specific stats are in the `player_stats` table.

---

### 3. `lobby`
Represents a game session that players can join.

**Fields:**
- `lobby_id` (UUID, PK) - Unique lobby identifier
- `host_user_id` (UUID, FK → users) - User who created the lobby
- `sport` (text, default: "Basketball") - Sport type
- `campus` (text, default: "Busch") - Campus location
- `location_id` (UUID, FK → locations) - Specific venue
- `is_public` (boolean, default: true) - Whether lobby appears in public listings
- `max_players` (integer, default: 5) - Maximum participants (must be > 1)
- `status` (lobby_status, default: "open") - Current lobby state
- `scheduled_start_time` (timestamptz) - When game is planned to start
- `created_at` (timestamptz) - When lobby was created

**Lifecycle**: 
1. Host creates lobby (status: `open`)
2. Players join until full (status: `full`)
3. Game starts (status: `in_progress`)
4. Game ends (status: `completed`)

---

### 4. `lobby_participants`
Tracks which players are in each lobby and their readiness status.

**Fields:**
- `lobby_id` (UUID, PK, FK → lobby) - Which lobby
- `player_id` (UUID, PK, FK → users) - Which player
- `joined_at` (timestamptz, default: now()) - When the player joined the lobby
- `is_ready` (boolean, default: false) - Player confirmed they're ready
- `current_team` (text, nullable) - Assigned team (e.g., "team_a", "team_b")

**Composite Primary Key**: `(lobby_id, player_id)` ensures a player can't join the same lobby twice.

**Purpose**: Manages the roster for each lobby and allows team formation before matches begin.

---

### 5. `matches`
Records actual games played within a lobby.

**Fields:**
- `match_id` (UUID, PK) - Unique match identifier
- `lobby_id` (UUID, FK → lobby) - Parent lobby
- `match_number` (integer) - Sequential match number within lobby (1st game, 2nd game, etc.)
- `status` (match_status, default: "scheduled") - Current match state
- `started_at` / `ended_at` (timestamptz, nullable) - Actual game timing
- `winner_team` (text, nullable) - Winning team identifier
- `created_at` (timestamptz) - When match was created

**Unique Constraint**: `(lobby_id, match_number)` prevents duplicate match numbers per lobby.

**Use Case**: A lobby can host multiple consecutive matches (e.g., best of 3), each tracked separately.

---

### 6. `match_players`
Links players to specific matches and tracks their ELO changes.

**Fields:**
- `match_id` (UUID, PK, FK → matches) - Which match
- `player_id` (UUID, PK, FK → users) - Which player
- `team` (text, nullable) - Team assignment for this match
- `elo_before` / `elo_after` (integer, nullable) - ELO rating before/after match

**Composite Primary Key**: `(match_id, player_id)` ensures each player is recorded once per match.

**Purpose**: Creates a permanent record of who played in each match and how their skill rating changed. This enables ELO transparency and match history tracking.

---

### 7. `player_stats`
Sport-specific statistics for each player.

**Fields:**
- `stat_id` (UUID, PK) - Unique identifier
- `user_id` (UUID, FK → users) - Player reference
- `sport` (text, default: "Basketball") - Sport type
- `matches_played` / `wins` / `losses` (integer, default: 0) - Game counts
- `elo` (integer, default: 0) - Skill rating for this sport
- `current_streak` (integer, default: 0) - Consecutive wins
- `created_at` (timestamptz) - When stats tracking began

**Unique Constraint**: `(user_id, sport)` ensures one stats record per player per sport.

**Example**: A player might have 1500 ELO in Basketball but 800 ELO in Soccer, tracked separately.

---

### 8. `notifications`
Stores in-app notifications for users.

**Fields:**
- `notification_id` (UUID, PK) - Unique identifier
- `recipient_id` (UUID, FK → users) - Who receives the notification
- `message` (text) - Notification content
- `type` (notification_type, default: "system_announcement") - Notification category
- `is_read` (boolean, default: false) - Read status
- `created_at` (timestamptz) - When notification was created

**Purpose**: Keeps users informed about lobby invites, match results, ELO changes, and system updates. The `is_read` flag supports unread notification counts in the UI.

---

## Relationships

### User → Lobby (One-to-Many)
- A user can host multiple lobbies
- Each lobby has exactly one host
- Cascade delete: If user is deleted, their lobbies are deleted

### Lobby → Lobby Participants (One-to-Many)
- A lobby has many participants
- A participant joins one lobby at a time
- Cascade delete: If lobby is deleted, all participant records are deleted

### Lobby → Matches (One-to-Many)
- A lobby can have multiple matches (e.g., best of 3)
- Each match belongs to one lobby
- Cascade delete: If lobby is deleted, all matches are deleted

### Match → Match Players (One-to-Many)
- A match has multiple players
- Each player record is tied to one match
- Stores team assignment and ELO changes

### User → Player Stats (One-to-Many)
- A user has multiple stat records (one per sport)
- Tracks sport-specific performance

### User → Notifications (One-to-Many)
- A user receives many notifications
- Each notification has one recipient

### Location → Lobby (One-to-Many)
- A location can host many lobbies
- Each lobby uses one location
- Set null on delete: If location is deleted, lobby.location_id becomes null

---

## Data Flow Example

### Creating and Playing a Game

1. **User creates lobby**
   - Record added to `lobby` table
   - Host automatically added to `lobby_participants`

2. **Players join**
   - Records added to `lobby_participants`
   - Lobby status changes to `full` when max_players reached

3. **Teams are assigned**
   - `current_team` updated in `lobby_participants`
   - Players mark themselves as `is_ready`

4. **Match starts**
   - Record created in `matches` table
   - Players copied to `match_players` with `elo_before` captured
   - Match status → `in_progress`
   - Lobby status → `in_progress`

5. **Match ends**
   - `winner_team` recorded
   - `elo_after` calculated and stored in `match_players`
   - Player stats updated in `player_stats`
   - Notifications sent about ELO changes
   - Match status → `completed`

6. **Next match or lobby closes**
   - If more matches needed, new record in `matches` with incremented `match_number`
   - Otherwise, lobby status → `completed`

---

## Security Model

### Authentication
- Uses Supabase Auth for user authentication
- `users.user_id` references `auth.users(id)` with cascade delete

### Auto-User Creation Trigger
When a new user signs up through Supabase Auth:
1. Trigger `on_auth_user_created` fires
2. Function `handle_new_user()` executes
3. User profile automatically created in `users` table
4. Username extracted from signup metadata or auto-generated

### Row-Level Security (RLS)
*Note: RLS policies should be implemented to ensure users can only access appropriate data.*

---

## Indexing Strategy

While not explicitly defined in the schema, consider these indexes for performance:

- `lobby.status` - Filtering open lobbies
- `lobby.campus` - Campus-specific searches
- `matches.lobby_id` - Finding all matches for a lobby
- `notifications.recipient_id, is_read` - Unread notification queries
- `player_stats.sport` - Sport-specific leaderboards

---

## Data Integrity

### Constraints
- **Primary Keys**: All tables use UUIDs as primary keys
- **Foreign Keys**: Enforce referential integrity with cascade/set null rules
- **Check Constraints**: 
  - `max_players > 1` ensures valid lobby sizes
  - `match_number > 0` prevents invalid numbering
  - `elo >= 0` prevents negative ratings
  - Stats fields (`matches_played`, `wins`, `losses`) >= 0
- **Unique Constraints**:
  - `users.username` prevents duplicate usernames
  - `(lobby_id, match_number)` prevents duplicate matches
  - `(user_id, sport)` in player_stats prevents duplicate stat records

### Cascade Behavior
- **User deletion**: Cascades to lobbies, participants, matches, stats, notifications
- **Lobby deletion**: Cascades to participants and matches
- **Match deletion**: Cascades to match_players
- **Location deletion**: Sets `location_id` to null in lobbies