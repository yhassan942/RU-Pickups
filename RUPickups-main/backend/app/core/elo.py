"""
Elo rating update for a player against an opposing team's average rating.

Formulas (per product spec):
    Elo1 = Elo2 + K * (S - E)

    E = 1 / (1 + 10^((R1 - R2) / 400))

    R1 = average enemy team's Elo
    R2 = player's Elo

`K` controls how much the rating moves per match. `S` is the match outcome for the player.
"""

from __future__ import annotations

from math import pow

# --- K: how much the rating changes per match ---
K_FACTOR: int = 32

# --- S: outcome of the match for this player (used in Elo1 = Elo2 + K(S - E)) ---
S_WIN: float = 1.0
S_LOSS: float = 0.0
S_DRAW: float = 0.5


def expected_win_probability(
    *,
    r1_average_enemy_team_elo: float,
    r2_player_elo: float,
) -> float:
    """
    Expected score E (probability of winning) for the player.

    E = 1 / (1 + 10^((R1 - R2) / 400))

    R1 = average enemy team's Elo
    R2 = player's Elo
    """
    r1 = r1_average_enemy_team_elo
    r2 = r2_player_elo
    return 1.0 / (1.0 + pow(10.0, (r1 - r2) / 400.0))


def calculate_new_elo(
    *,
    elo2_player_elo_before: float,
    r1_average_enemy_team_elo: float,
    s_outcome: float,
    k: int = K_FACTOR,
) -> float:
    """
    New player Elo after one match.

    Elo1 = Elo2 + K * (S - E)

    Elo2 = player's Elo before the match
    Elo1 = player's Elo after the match (return value)
    S    = outcome (use S_WIN, S_LOSS, or S_DRAW)
    E    = expected win probability from expected_win_probability(...)
    """
    e_expected = expected_win_probability(
        r1_average_enemy_team_elo=r1_average_enemy_team_elo,
        r2_player_elo=elo2_player_elo_before,
    )
    return elo2_player_elo_before + k * (s_outcome - e_expected)


__all__ = [
    "K_FACTOR",
    "S_WIN",
    "S_LOSS",
    "S_DRAW",
    "expected_win_probability",
    "calculate_new_elo",
]
