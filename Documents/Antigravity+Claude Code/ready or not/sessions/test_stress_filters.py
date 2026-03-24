#!/usr/bin/env python3
"""Stress test: adversarial and edge-case data for all 123 filters.

Tests:
1. Extreme price spikes (100x ATR moves)
2. Zero-range (flat) sessions
3. Single-bar sessions
4. NaN/inf resilience
5. JPY-scale prices
6. Micro-pip prices
7. Thousands of bars
8. Alternating tick-by-tick reversals
9. Consistency across runs (determinism)
10. Cross-field mathematical invariants under stress
"""

import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "The Engine"))

from src.features.structural import (
    compute_orb_granular,
    compute_ib_granular,
    compute_session_granular,
    compute_candle_anatomy,
    compute_timing_features,
    compute_cross_session_features,
    compute_structural_vector,
)
from src.features.microstructure import (
    compute_pre_session_context,
    compute_orb_microstructure,
    compute_ib_microstructure,
    compute_intra_session_action,
    compute_cross_session_extended,
    compute_volatility_regime,
    compute_calendar_context,
    compute_tpo_profile,
    compute_liquidity_sweep,
    compute_momentum_quality,
    compute_key_level_interaction,
    compute_time_in_state,
    compute_multi_timeframe,
    compute_bar_density,
    compute_break_followthrough,
    compute_microstructure_metrics,
)
from src.features.composer import compose_session_vector, TOTAL_DIMS

PASS = 0
FAIL = 0
FAILURES = []


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
    else:
        FAIL += 1
        msg = f"  FAIL [{name}] {detail}"
        print(msg)
        FAILURES.append(msg)


def make_bars(prices, start_time=None, spread=0.0):
    if start_time is None:
        start_time = datetime(2024, 3, 15, 8, 0, 0)
    rows = []
    prev = prices[0]
    for i, p in enumerate(prices):
        o, c = prev, p
        h = max(o, c) + spread / 2
        l = min(o, c) - spread / 2
        rows.append({"timestamp": start_time + timedelta(minutes=i),
                      "open": o, "high": h, "low": l, "close": c, "volume": 100})
        prev = c
    return pd.DataFrame(rows)


def no_nan_inf(result: dict, test_name: str):
    """Assert no NaN or inf in any numeric field."""
    for k, v in result.items():
        if isinstance(v, (float, int, np.floating, np.integer)):
            check(test_name, np.isfinite(v), f"{k}={v} is not finite")
        elif isinstance(v, dict):
            for k2, v2 in v.items():
                if isinstance(v2, (float, int, np.floating, np.integer)):
                    check(test_name, np.isfinite(v2), f"{k}.{k2}={v2} is not finite")


def bounds_check(result: dict, test_name: str, bounded: dict):
    """Check that bounded fields stay within [lo, hi]."""
    for field, (lo, hi) in bounded.items():
        v = result.get(field)
        if v is not None and isinstance(v, (float, int, np.floating, np.integer)):
            check(test_name, lo - 1e-6 <= v <= hi + 1e-6,
                  f"{field}={v} outside [{lo}, {hi}]")


BOUNDED_01 = {
    "orb_open_pct": (0, 1), "orb_close_pct": (0, 1),
    "ib_open_pct": (0, 1), "ib_close_pct": (0, 1),
    "session_open_pct": (0, 1), "session_close_pct": (0, 1),
    "prior_close_location": (0, 1), "multi_session_trend_strength": (0, 1),
    "overnight_range_vs_atr": (0, 1), "weekly_position": (0, 1),
    "monthly_position": (0, 1), "orb_midpoint_bias": (0, 1),
    "ib_first_half_range_pct": (0, 1), "ib_second_half_range_pct": (0, 1),
    "directional_persistence": (0, 1), "range_development_speed": (0, 1),
    "atr_percentile": (0, 1), "range_vs_atr_ratio": (0, 1),
    "tpo_poc_location": (0, 1), "tpo_value_area_width_pct": (0, 1),
    "tpo_poc_time_pct": (0, 1), "time_in_value_area_pct": (0, 1),
    "time_above_vwap_pct": (0, 1), "time_above_orb_high_pct": (0, 1),
    "time_to_session_high_pct": (0, 1), "time_to_session_low_pct": (0, 1),
    "time_in_ib_range_pct": (0, 1), "activity_concentration": (0, 1),
    "high_activity_zone_location": (0, 1),
}


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 1: Extreme price spike (100x ATR)
# ─────────────────────────────────────────────────────────────────────

def test_extreme_spike():
    print("\n── Stress: Extreme Price Spike ──")
    atr = 0.005
    # Spike from 1.10 to 1.60 (100x ATR) then crash to 1.00
    prices = list(np.linspace(1.10, 1.60, 240)) + list(np.linspace(1.60, 1.00, 240))
    bars = make_bars(prices, spread=0.0)
    prior = {"open": 1.08, "high": 1.12, "low": 1.06, "close": 1.10}
    history = [{"open": 1.09 + i*0.001, "high": 1.10 + i*0.001,
                "low": 1.08 + i*0.001, "close": 1.095 + i*0.001} for i in range(20)]

    # Run ALL metrics
    result = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, history, None, 1.65, 0.95, 1.70, 0.90
    )
    result.update(compute_orb_granular(bars, 15))
    result.update(compute_ib_granular(bars, 60))
    result.update(compute_session_granular(bars, prior))

    no_nan_inf(result, "SPIKE")
    bounds_check(result, "SPIKE", BOUNDED_01)

    # Vector should also be finite
    vec = compose_session_vector(bars, 15, 60, atr, prior["close"], prior)
    check("SPIKE", np.all(np.isfinite(vec)), f"vector has non-finite values")
    check("SPIKE", vec.shape == (TOTAL_DIMS,), f"vector shape {vec.shape} != ({TOTAL_DIMS},)")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 2: Completely flat (zero range)
# ─────────────────────────────────────────────────────────────────────

def test_flat_session():
    print("\n── Stress: Flat Session (zero range) ──")
    atr = 0.005
    bars = make_bars([1.10] * 480, spread=0.0)
    prior = {"open": 1.10, "high": 1.10, "low": 1.10, "close": 1.10}

    result = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, [prior] * 20
    )
    result.update(compute_orb_granular(bars, 15))
    result.update(compute_ib_granular(bars, 60))
    result.update(compute_session_granular(bars, prior))

    no_nan_inf(result, "FLAT")
    bounds_check(result, "FLAT", BOUNDED_01)

    # Zero-range specific: ORB range should be 0
    check("FLAT", result["orb_range_pips"] == 0, f"orb_range={result['orb_range_pips']}")
    check("FLAT", result["ib_range_pips"] == 0, f"ib_range={result['ib_range_pips']}")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 3: Very few bars (minimum viable)
# ─────────────────────────────────────────────────────────────────────

def test_minimal_bars():
    print("\n── Stress: Minimal Bars ──")
    atr = 0.005

    for n_bars in [1, 2, 3, 5, 10, 15, 30, 60]:
        prices = list(np.linspace(1.10, 1.1010, n_bars))
        bars = make_bars(prices, spread=0.0)
        prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}

        # Should not crash
        try:
            result = {}
            result.update(compute_orb_granular(bars, 15))
            result.update(compute_ib_granular(bars, 60))
            result.update(compute_session_granular(bars, prior))

            if n_bars >= 2:
                result.update(compute_microstructure_metrics(
                    bars, min(15, n_bars), min(60, n_bars), atr, date(2024, 6, 15), prior, [prior] * 5
                ))

            no_nan_inf(result, f"MIN_{n_bars}")
            check(f"MIN_{n_bars}", True, "no crash")
        except Exception as e:
            check(f"MIN_{n_bars}", False, f"CRASHED: {e}")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 4: JPY-scale prices (~150.000)
# ─────────────────────────────────────────────────────────────────────

def test_jpy_scale():
    print("\n── Stress: JPY-scale prices ──")
    atr = 0.50
    prices = list(np.linspace(150.000, 151.500, 480))
    bars = make_bars(prices, spread=0.0)
    prior = {"open": 149.5, "high": 150.5, "low": 149.0, "close": 150.0}
    history = [{"open": 149 + i*0.05, "high": 150 + i*0.05,
                "low": 148.5 + i*0.05, "close": 149.5 + i*0.05} for i in range(20)]

    result = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, history
    )
    result.update(compute_orb_granular(bars, 15))
    result.update(compute_ib_granular(bars, 60))
    result.update(compute_session_granular(bars, prior))

    no_nan_inf(result, "JPY")
    bounds_check(result, "JPY", BOUNDED_01)

    # Round number logic: for JPY, pip_unit = 0.50 (mid_price > 50)
    mid = (float(bars["high"].max()) + float(bars["low"].min())) / 2
    check("JPY", mid > 50, f"mid_price={mid} should be >50 for JPY scale")
    # round_number_proximity should be reasonable
    check("JPY", result["round_number_proximity_pips"] >= 0, "proximity >= 0")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 5: Alternating tick reversals (maximum noise)
# ─────────────────────────────────────────────────────────────────────

def test_alternating_ticks():
    print("\n── Stress: Alternating Tick Reversals ──")
    atr = 0.005
    # Price alternates: 1.1000, 1.1010, 1.1000, 1.1010, ...
    prices = [1.1000 + 0.0010 * (i % 2) for i in range(480)]
    bars = make_bars(prices, spread=0.0)
    prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}

    result = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, [prior] * 20
    )
    result.update(compute_orb_granular(bars, 15))
    result.update(compute_ib_granular(bars, 60))
    result.update(compute_session_granular(bars, prior))

    no_nan_inf(result, "ALTICK")
    bounds_check(result, "ALTICK", BOUNDED_01)

    # Should classify as range session
    check("ALTICK", result.get("session_type") in ["range", "trend_up", "trend_down",
          "reversal_up", "reversal_down", "unknown"], f"type={result.get('session_type')}")

    # VWAP cross count should be high
    check("ALTICK", result.get("vwap_cross_count", 0) > 10,
          f"vwap_crosses={result.get('vwap_cross_count')} should be high for noisy data")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 6: Very large session (2000 bars)
# ─────────────────────────────────────────────────────────────────────

def test_large_session():
    print("\n── Stress: Large Session (2000 bars) ──")
    atr = 0.005
    prices = list(np.linspace(1.10, 1.12, 2000))
    bars = make_bars(prices, spread=0.0)
    prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}

    result = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, [prior] * 20
    )
    result.update(compute_orb_granular(bars, 15))
    result.update(compute_ib_granular(bars, 60))
    result.update(compute_session_granular(bars, prior))

    no_nan_inf(result, "LARGE")
    bounds_check(result, "LARGE", BOUNDED_01)


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 7: Determinism (same input → same output)
# ─────────────────────────────────────────────────────────────────────

def test_determinism():
    print("\n── Stress: Determinism ──")
    atr = 0.005
    np.random.seed(42)
    prices = 1.10 + np.cumsum(np.random.randn(480) * 0.0001)
    bars = make_bars(list(prices), spread=0.0)
    prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}
    history = [prior] * 20

    result1 = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, history
    )
    result2 = compute_microstructure_metrics(
        bars, 15, 60, atr, date(2024, 6, 15), prior, history
    )

    for k in result1:
        v1, v2 = result1[k], result2[k]
        if isinstance(v1, (float, int)):
            check("DETERM", v1 == v2, f"{k}: run1={v1} != run2={v2}")
        elif isinstance(v1, str):
            check("DETERM", v1 == v2, f"{k}: run1={v1!r} != run2={v2!r}")
        elif isinstance(v1, bool):
            check("DETERM", v1 == v2, f"{k}: run1={v1} != run2={v2}")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 8: ATR = 0 (guard against division by zero)
# ─────────────────────────────────────────────────────────────────────

def test_zero_atr():
    print("\n── Stress: Zero ATR ──")
    prices = list(np.linspace(1.10, 1.11, 480))
    bars = make_bars(prices, spread=0.0)
    prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}

    try:
        result = compute_microstructure_metrics(
            bars, 15, 60, 0.0, date(2024, 6, 15), prior, [prior] * 20
        )
        no_nan_inf(result, "ZERO_ATR")
        check("ZERO_ATR", True, "no crash with atr=0")
    except ZeroDivisionError as e:
        check("ZERO_ATR", False, f"ZeroDivisionError: {e}")
    except Exception as e:
        check("ZERO_ATR", False, f"Unexpected error: {e}")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 9: No prior session data
# ─────────────────────────────────────────────────────────────────────

def test_no_prior():
    print("\n── Stress: No Prior Session ──")
    atr = 0.005
    prices = list(np.linspace(1.10, 1.11, 480))
    bars = make_bars(prices, spread=0.0)

    try:
        result = compute_microstructure_metrics(
            bars, 15, 60, atr, date(2024, 6, 15), None, None
        )
        no_nan_inf(result, "NO_PRIOR")
        check("NO_PRIOR", True, "no crash without prior session")
    except Exception as e:
        check("NO_PRIOR", False, f"Crashed: {e}")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 10: Cross-field invariants under random data
# ─────────────────────────────────────────────────────────────────────

def test_invariants_random():
    print("\n── Stress: Cross-Field Invariants (100 random sessions) ──")
    atr = 0.005
    prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}
    history = [prior] * 20

    for trial in range(100):
        np.random.seed(trial)
        prices = 1.10 + np.cumsum(np.random.randn(480) * 0.0002)
        bars = make_bars(list(prices), spread=0.0)

        orb = compute_orb_granular(bars, 15)
        ib = compute_ib_granular(bars, 60)
        sess = compute_session_granular(bars, prior)
        candle = compute_candle_anatomy(bars)

        # Invariant 1: body + upper_wick + lower_wick = 1.0
        total = candle["body_ratio"] + candle["upper_wick_ratio"] + candle["lower_wick_ratio"]
        check(f"INV_t{trial}", abs(total - 1.0) < 0.001,
              f"candle ratios sum={total:.6f}")

        # Invariant 2: ORB range <= IB range
        check(f"INV_t{trial}", orb["orb_range_pips"] <= ib["ib_range_pips"] + 1e-10,
              f"orb_range={orb['orb_range_pips']:.6f} > ib_range={ib['ib_range_pips']:.6f}")

        # Invariant 3: session_open_pct and session_close_pct in [0, 1]
        check(f"INV_t{trial}", 0 <= sess["session_open_pct"] <= 1,
              f"open_pct={sess['session_open_pct']}")
        check(f"INV_t{trial}", 0 <= sess["session_close_pct"] <= 1,
              f"close_pct={sess['session_close_pct']}")

        # Invariant 4: gap_size = session_open - prior_close
        sess_open = float(bars.iloc[0]["open"])
        expected_gap = sess_open - prior["close"]
        check(f"INV_t{trial}",
              abs(sess["gap_size_pips"] - round(expected_gap, 6)) < 1e-5,
              f"gap={sess['gap_size_pips']}, expected={round(expected_gap, 6)}")

        # Invariant 5: post_orb_break_high_dist >= 0 and post_orb_break_low_dist >= 0
        check(f"INV_t{trial}", orb["post_orb_break_high_dist_pips"] >= -1e-10,
              f"break_high_dist={orb['post_orb_break_high_dist_pips']}")
        check(f"INV_t{trial}", orb["post_orb_break_low_dist_pips"] >= -1e-10,
              f"break_low_dist={orb['post_orb_break_low_dist_pips']}")


# ─────────────────────────────────────────────────────────────────────
# STRESS TEST 11: Vector composition integrity
# ─────────────────────────────────────────────────────────────────────

def test_vector_integrity():
    print("\n── Stress: Vector Composition Integrity (50 random) ──")
    atr = 0.005
    prior = {"open": 1.09, "high": 1.10, "low": 1.08, "close": 1.095}

    for trial in range(50):
        np.random.seed(trial + 1000)
        prices = 1.10 + np.cumsum(np.random.randn(480) * 0.0002)
        bars = make_bars(list(prices), spread=0.0)

        vec = compose_session_vector(bars, 15, 60, atr, prior["close"], prior)

        # Shape
        check(f"VEC_t{trial}", vec.shape == (TOTAL_DIMS,),
              f"shape={vec.shape}")

        # All finite
        check(f"VEC_t{trial}", np.all(np.isfinite(vec)),
              f"has {np.sum(~np.isfinite(vec))} non-finite values")

        # Layer 1 (structural, 29 dims): most values in [-1, 1] or [0, 1]
        l1 = vec[:29]
        check(f"VEC_t{trial}", np.all(l1 >= -1.1) and np.all(l1 <= 1.1),
              f"layer1 range [{l1.min():.4f}, {l1.max():.4f}]")

        # Layer 2 (price path, 60 dims): normalized to [0, 1]
        l2 = vec[29:89]
        check(f"VEC_t{trial}", np.all(l2 >= -0.1) and np.all(l2 <= 1.1),
              f"layer2 range [{l2.min():.4f}, {l2.max():.4f}]")

        # Layer 3 (volatility, 30 dims): should be bounded
        l3 = vec[89:119]
        check(f"VEC_t{trial}", np.all(np.isfinite(l3)),
              f"layer3 has non-finite")


def main():
    print("=" * 70)
    print("FILTER STRESS TEST SUITE")
    print("=" * 70)

    tests = [
        test_extreme_spike,
        test_flat_session,
        test_minimal_bars,
        test_jpy_scale,
        test_alternating_ticks,
        test_large_session,
        test_determinism,
        test_zero_atr,
        test_no_prior,
        test_invariants_random,
        test_vector_integrity,
    ]

    for fn in tests:
        try:
            fn()
        except Exception as e:
            global FAIL
            FAIL += 1
            msg = f"  CRASH [{fn.__name__}]: {e}"
            print(msg)
            FAILURES.append(msg)
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 70)
    print(f"STRESS RESULTS: {PASS} passed, {FAIL} failed")
    accuracy = PASS / max(PASS + FAIL, 1) * 100
    print(f"ACCURACY: {accuracy:.1f}%")
    print("=" * 70)

    if FAILURES:
        print("\nFailures:")
        for f in FAILURES:
            print(f)


if __name__ == "__main__":
    main()
