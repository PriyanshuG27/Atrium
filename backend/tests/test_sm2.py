"""
backend/tests/test_sm2.py
=========================
Unit tests for the SM-2 Spaced Repetition Algorithm.
"""

import pytest
from backend.services.sm2 import update_sm2

def test_sm2_wrong_answer_q1():
    # Wrong answer (q=1) | ef=2.5, interval=1 -> ease_factor=1.7, interval_days=1
    new_ef, new_interval = update_sm2(2.5, 1, 1)
    assert pytest.approx(new_ef) == 1.7
    assert new_interval == 1

def test_sm2_correct_easy_q5():
    # Correct easy (q=5) | ef=2.5, interval=1 -> ease_factor=2.6, interval_days=3
    new_ef, new_interval = update_sm2(2.5, 1, 5)
    assert pytest.approx(new_ef) == 2.6
    assert new_interval == 3

def test_sm2_correct_ok_q4():
    # Correct ok (q=4) | ef=2.5, interval=3 -> ease_factor=2.5, interval_days=8
    new_ef, new_interval = update_sm2(2.5, 3, 4)
    assert pytest.approx(new_ef) == 2.5
    assert new_interval == 8

def test_sm2_wrong_after_streak():
    # Wrong after streak | ef=2.5, interval=8, q=1 -> ease_factor=1.7, interval_days=1
    new_ef, new_interval = update_sm2(2.5, 8, 1)
    assert pytest.approx(new_ef) == 1.7
    assert new_interval == 1

def test_sm2_ease_factor_floor():
    # ease_factor floor | ef=1.3, q=1 -> ease_factor=1.3 (clamped), interval_days=1
    new_ef, new_interval = update_sm2(1.3, 5, 1)
    assert pytest.approx(new_ef) == 1.3
    assert new_interval == 1

def test_sm2_invalid_quality():
    with pytest.raises(ValueError):
        update_sm2(2.5, 1, 6)
    with pytest.raises(ValueError):
        update_sm2(2.5, 1, -1)
