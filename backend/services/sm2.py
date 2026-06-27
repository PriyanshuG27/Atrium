"""
backend/services/sm2.py
======================
Implementation of the SM-2 Spaced Repetition Algorithm.
"""

import math

def round_half_up(n: float) -> int:
    """
    Rounds a number to the nearest integer, rounding half up (e.g. 2.5 -> 3, 7.5 -> 8).
    This matches standard mathematical rounding and avoids Python's default banker's rounding.
    """
    return math.floor(n + 0.5)

def update_sm2(
    ease_factor: float,
    interval_days: int,
    quality: int
) -> tuple[float, int]:
    """
    Updates ease_factor and interval_days based on response quality (0-5) using the SM-2 algorithm.
    
    Algorithm Rules:
    - Quality 0-2 (Wrong):
      interval = 1
      ease_factor = max(1.3, ease_factor - 0.8)
    - Quality 3 (Correct - Hard):
      interval = interval (unchanged)
      ease_factor = ease_factor (unchanged)
    - Quality 4 (Correct - OK):
      interval = round(interval * ease_factor)
      ease_factor = ease_factor (unchanged)
    - Quality 5 (Correct - Easy):
      interval = round(interval * ease_factor)
      ease_factor = ease_factor + 0.1
      
    Returns:
        tuple[float, int]: (new_ease_factor, new_interval_days)
    """
    # Force quality within boundaries
    if not (0 <= quality <= 5):
        raise ValueError("Quality must be an integer between 0 and 5.")

    if quality < 3:
        new_interval = 1
        new_ease_factor = ease_factor - 0.8
    elif quality == 3:
        new_interval = interval_days
        new_ease_factor = ease_factor
    elif quality == 4:
        new_interval = round_half_up(interval_days * ease_factor)
        new_ease_factor = ease_factor
    else:  # quality == 5
        new_interval = round_half_up(interval_days * ease_factor)
        new_ease_factor = ease_factor + 0.1

    # Clamp ease_factor to a minimum of 1.3
    new_ease_factor = max(1.3, new_ease_factor)

    return (new_ease_factor, new_interval)
