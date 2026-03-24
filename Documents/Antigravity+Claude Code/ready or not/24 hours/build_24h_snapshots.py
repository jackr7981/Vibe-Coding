#!/usr/bin/env python3
"""Build 24-hour rolling snapshots: vectors + filters + outcomes.

No session boundaries. Every hour, take the last 4 hours of 1-min bars,
compute the 119-dim vector + all metadata filters, and record what happens
next (1h, 2h, 4h outcomes).

Usage:
    python "ready or not/24 hours/build_24h_snapshots.py"
"""

import sys
import json
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

# Project root
ENGINE_ROOT = Path(__file__).resolve().parent.parent.parent / "The Engine"
sys.path.insert(0, str(ENGINE_ROOT))

from src.data.loader import load_all_pairs
from src.data.preprocessor import clean_ohlcv
from src.features.composer import compose_session_vector, compute_session_ohlc, TOTAL_DIMS
from src.features.structural import compute_granular_metrics

warnings.filterwarnings("ignore", category=FutureWarning)

# ═══════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════

WINDOW_BARS = 240      # 4 hours of 1-min bars
STEP_BARS = 60         # 1 hour step
ORB_MIN = 15           # Opening range: first 15 minutes of window
IB_MIN = 60            # Initial balance: first 60 minutes of window
ATR_LOOKBACK = 20      # Rolling ATR over last 20 windows
PIP_MULT = 10000       # EURUSD pip multiplier
MIN_WINDOW_BARS = 200  # Minimum bars in a window to be valid (~83%)

# Outcome horizons (in bars = minutes)
OUTCOME_1H = 60
OUTCOME_2H = 120
OUTCOME_4H = 240

RAW_DIR = ENGINE_ROOT / "data" / "raw"
OUTPUT_DIR = Path(__file__).parent


# ═══════════════════════════════════════════════════════════════════════
# OUTCOME COMPUTATION
# ═══════════════════════════════════════════════════════════════════════


def compute_outcome(all_bars: pd.DataFrame, end_idx: int, horizon: int) -> dict:
    """Compute outcome for the next `horizon` bars starting at end_idx.

    Returns dict with direction, change_pips, max_favorable, max_adverse,
    and big_move (>=15 pips).
    """
    start = end_idx
    stop = min(end_idx + horizon, len(all_bars))
    future = all_bars.iloc[start:stop]

    if len(future) < horizon * 0.5:  # Need at least 50% of bars
        return {}

    open_price = float(future.iloc[0]["open"])
    close_price = float(future.iloc[-1]["close"])
    high_price = float(future["high"].max())
    low_price = float(future["low"].min())

    change = close_price - open_price
    change_pips = change * PIP_MULT
    abs_change_pips = abs(change_pips)

    # Max favorable/adverse from open
    max_up = (high_price - open_price) * PIP_MULT
    max_down = (open_price - low_price) * PIP_MULT

    direction = "bullish" if change_pips > 1 else ("bearish" if change_pips < -1 else "neutral")

    return {
        "direction": direction,
        "change_pips": round(change_pips, 2),
        "abs_change_pips": round(abs_change_pips, 2),
        "max_up_pips": round(max_up, 2),
        "max_down_pips": round(max_down, 2),
        "big_move": abs_change_pips >= 15,
        "range_pips": round((high_price - low_price) * PIP_MULT, 2),
        "open": open_price,
        "close": close_price,
        "high": high_price,
        "low": low_price,
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN BUILD
# ═══════════════════════════════════════════════════════════════════════


def build_snapshots():
    """Build rolling 4h snapshots with vectors, filters, and outcomes."""
    print("=" * 70)
    print("24-HOUR ROLLING SNAPSHOT BUILDER")
    print("=" * 70)

    # Step 1: Load raw data
    print("\n[1/4] Loading raw EURUSD data...")
    pair_data = load_all_pairs(str(RAW_DIR))
    if "EURUSD" not in pair_data:
        print("ERROR: EURUSD data not found in", RAW_DIR)
        return

    df = pair_data["EURUSD"]
    print(f"  Raw bars: {len(df):,}")
    print(f"  Range: {df['timestamp'].min()} to {df['timestamp'].max()}")

    # Step 2: Clean
    print("\n[2/4] Cleaning data...")
    df = clean_ohlcv(df)
    df = df.sort_values("timestamp").reset_index(drop=True)
    print(f"  Clean bars: {len(df):,}")

    # Step 3: Build snapshots
    print("\n[3/4] Building rolling snapshots...")
    print(f"  Window: {WINDOW_BARS} bars ({WINDOW_BARS // 60}h)")
    print(f"  Step: {STEP_BARS} bars ({STEP_BARS // 60}h)")
    print(f"  Outcomes: 1h, 2h, 4h ahead")

    # Rolling state
    window_ohlc_history = []   # For ATR computation
    prior_window_ohlc = None   # For cross-window features
    prior_granular = None      # For microstructure cross-reference
    weekly_tracking = {"high": None, "low": None, "week": None}
    monthly_tracking = {"high": None, "low": None, "month": None}

    snapshots = []
    total_bars = len(df)
    # Iterate hourly through the data
    checkpoint = 0
    skipped_weekends = 0
    skipped_gaps = 0

    for window_end_idx in range(WINDOW_BARS, total_bars, STEP_BARS):
        window_start_idx = window_end_idx - WINDOW_BARS
        window_bars = df.iloc[window_start_idx:window_end_idx].copy()

        # Skip if not enough bars (data gaps)
        if len(window_bars) < MIN_WINDOW_BARS:
            skipped_gaps += 1
            continue

        # Skip if window spans a weekend (timestamps jump > 48h within window)
        timestamps = window_bars["timestamp"]
        max_gap = timestamps.diff().max()
        if max_gap > pd.Timedelta(hours=6):
            skipped_gaps += 1
            continue

        # Get the checkpoint timestamp (end of window)
        checkpoint_time = window_bars.iloc[-1]["timestamp"]
        checkpoint_date = checkpoint_time.date() if hasattr(checkpoint_time, 'date') else checkpoint_time

        # Skip weekends
        if isinstance(checkpoint_date, date):
            if checkpoint_date.weekday() >= 5:
                skipped_weekends += 1
                continue

        # Reset index for the window bars (compose_session_vector expects 0-based)
        window_bars = window_bars.reset_index(drop=True)

        # Compute window OHLC
        ohlc = compute_session_ohlc(window_bars)
        window_ohlc_history.append(ohlc)

        # Update weekly/monthly tracking
        d = checkpoint_date
        iso_week = d.isocalendar()[1] if isinstance(d, date) else 0
        if weekly_tracking["week"] != iso_week:
            weekly_tracking = {"high": ohlc["high"], "low": ohlc["low"], "week": iso_week}
        else:
            weekly_tracking["high"] = max(weekly_tracking["high"], ohlc["high"])
            weekly_tracking["low"] = min(weekly_tracking["low"], ohlc["low"])

        current_month = d.month if isinstance(d, date) else 0
        if monthly_tracking["month"] != current_month:
            monthly_tracking = {"high": ohlc["high"], "low": ohlc["low"], "month": current_month}
        else:
            monthly_tracking["high"] = max(monthly_tracking["high"], ohlc["high"])
            monthly_tracking["low"] = min(monthly_tracking["low"], ohlc["low"])

        # Compute ATR: rolling average of window ranges
        if len(window_ohlc_history) >= 2:
            ranges = [h["high"] - h["low"] for h in window_ohlc_history]
            window = min(ATR_LOOKBACK, len(ranges))
            atr = float(np.mean(ranges[-window:]))
        else:
            atr = ohlc["high"] - ohlc["low"]

        if atr == 0:
            atr = 0.0001  # Minimum ATR fallback

        # Prior window data for cross-window features
        prior_close = prior_window_ohlc["close"] if prior_window_ohlc else None

        # Compose 119-dim vector
        vector = compose_session_vector(
            window_bars, ORB_MIN, IB_MIN, atr,
            prior_session_close=prior_close,
            prior_session_ohlc=prior_window_ohlc,
        )

        # Compute granular metrics (all 123+ filter fields)
        granular = compute_granular_metrics(
            window_bars, ORB_MIN, IB_MIN, prior_window_ohlc,
            session_atr=atr,
            session_date=checkpoint_date if isinstance(checkpoint_date, date) else None,
            session_history=window_ohlc_history[-20:],
            prior_granular_metrics=prior_granular,
            weekly_high=weekly_tracking.get("high"),
            weekly_low=weekly_tracking.get("low"),
            monthly_high=monthly_tracking.get("high"),
            monthly_low=monthly_tracking.get("low"),
        )

        # Compute outcomes at multiple horizons
        outcome_1h = compute_outcome(df, window_end_idx, OUTCOME_1H)
        outcome_2h = compute_outcome(df, window_end_idx, OUTCOME_2H)
        outcome_4h = compute_outcome(df, window_end_idx, OUTCOME_4H)

        # Build snapshot record
        snapshot = {
            "timestamp": str(checkpoint_time),
            "date": str(checkpoint_date),
            "hour_of_day": checkpoint_time.hour if hasattr(checkpoint_time, 'hour') else 0,
            "day_of_week": checkpoint_date.weekday() if isinstance(checkpoint_date, date) else 0,
            "pair": "EURUSD",
            "atr": float(atr),
            "bar_count": len(window_bars),
            "window_ohlc": json.dumps(ohlc),
            "vector": vector.tobytes(),
        }

        # Add all granular filters
        for k, v in granular.items():
            if isinstance(v, (np.integer, np.int64)):
                snapshot[k] = int(v)
            elif isinstance(v, (np.floating, np.float64)):
                snapshot[k] = float(v)
            elif isinstance(v, np.bool_):
                snapshot[k] = bool(v)
            else:
                snapshot[k] = v

        # Add outcomes
        snapshot["outcome_1h"] = json.dumps(outcome_1h)
        snapshot["outcome_2h"] = json.dumps(outcome_2h)
        snapshot["outcome_4h"] = json.dumps(outcome_4h)

        snapshots.append(snapshot)
        checkpoint += 1

        # Update prior state
        prior_window_ohlc = ohlc
        prior_granular = granular

        # Progress
        if checkpoint % 5000 == 0:
            print(f"    {checkpoint:,} snapshots built... (at {checkpoint_time})")

    print(f"\n  Total snapshots: {checkpoint:,}")
    print(f"  Skipped (weekend): {skipped_weekends:,}")
    print(f"  Skipped (gaps/short): {skipped_gaps:,}")

    # Step 4: Save to parquet
    print("\n[4/4] Saving to parquet...")
    out_df = pd.DataFrame(snapshots)
    output_path = OUTPUT_DIR / "snapshots_24h.parquet"
    out_df.to_parquet(output_path, index=False)
    print(f"  Saved: {output_path}")
    print(f"  Size: {output_path.stat().st_size / 1024 / 1024:.1f} MB")
    print(f"  Columns: {len(out_df.columns)}")
    print(f"  Date range: {out_df['date'].min()} to {out_df['date'].max()}")

    # Quick outcome summary
    outcomes_1h = [json.loads(s["outcome_1h"]) for s in snapshots if s["outcome_1h"] != "{}"]
    big_moves_1h = sum(1 for o in outcomes_1h if o.get("big_move", False))
    print(f"\n  Outcome summary (1h horizon):")
    print(f"    Total with outcomes: {len(outcomes_1h):,}")
    print(f"    Big moves (≥15 pips): {big_moves_1h:,} ({100*big_moves_1h/max(len(outcomes_1h),1):.1f}%)")

    # Direction distribution
    dirs = [o.get("direction", "neutral") for o in outcomes_1h]
    bull = dirs.count("bullish")
    bear = dirs.count("bearish")
    neut = dirs.count("neutral")
    print(f"    Bullish: {bull:,} ({100*bull/max(len(dirs),1):.1f}%)")
    print(f"    Bearish: {bear:,} ({100*bear/max(len(dirs),1):.1f}%)")
    print(f"    Neutral: {neut:,} ({100*neut/max(len(dirs),1):.1f}%)")

    print("\nDone!")
    return out_df


if __name__ == "__main__":
    build_snapshots()
