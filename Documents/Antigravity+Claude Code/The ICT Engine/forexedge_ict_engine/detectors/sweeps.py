"""
Liquidity Sweep Detector.

Buyside sweep: Bar breaks ABOVE a recent swing high but CLOSES BELOW it
  → grabs buy stops → ICT expects bearish reversal

Sellside sweep: Bar breaks BELOW a recent swing low but CLOSES ABOVE it
  → grabs sell stops → ICT expects bullish reversal
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import (
    SWEEP_SWING_LOOKBACK, SWEEP_MIN_DEPTH_PIPS, SWEEP_LOOKAHEAD_BARS,
    PIP_MULTIPLIER, RANGE_POSITION_LOOKBACK,
)


def detect_sweeps(
    df: pd.DataFrame,
    swings: pd.DataFrame,
    pair: str = "EURUSD",
) -> pd.DataFrame:
    """Detect liquidity sweeps using swing points.

    Args:
        df: 15-min OHLCV DataFrame with indicators and session labels
        swings: Output from detect_swings()
        pair: Currency pair

    Returns:
        DataFrame with sweep detections, metadata, and outcomes.
    """
    pip_mult = PIP_MULTIPLIER.get(pair, 10_000)

    high = df["high"].values
    low = df["low"].values
    close = df["close"].values
    open_ = df["open"].values
    timestamps = df["timestamp"].values
    atr = df["atr_14"].values if "atr_14" in df.columns else np.full(len(df), np.nan)
    sma_slope = df["sma_slope"].values if "sma_slope" in df.columns else np.full(len(df), np.nan)
    sessions = df["session"].values if "session" in df.columns else np.full(len(df), "Unknown")
    trading_dates = df["trading_date"].values if "trading_date" in df.columns else np.full(len(df), None)

    # Build swing index lookup: bar_index → (type, level)
    swing_highs = swings[swings["type"] == "swing_high"][["bar_index", "level"]].values
    swing_lows = swings[swings["type"] == "swing_low"][["bar_index", "level"]].values

    records = []
    last_sweep_bar = -10  # Prevent double-counting within 5 bars

    for i in range(SWEEP_SWING_LOOKBACK, len(df)):
        if i - last_sweep_bar < 3:
            continue

        # Find most recent swing high within lookback
        recent_sh = swing_highs[
            (swing_highs[:, 0] >= i - SWEEP_SWING_LOOKBACK) &
            (swing_highs[:, 0] < i - 1)  # Must be before current bar
        ]

        # Find most recent swing low within lookback
        recent_sl = swing_lows[
            (swing_lows[:, 0] >= i - SWEEP_SWING_LOOKBACK) &
            (swing_lows[:, 0] < i - 1)
        ]

        # Check buyside sweep (break above swing high, close below)
        if len(recent_sh) > 0:
            # Use the most recent swing high
            sh_idx = int(recent_sh[-1, 0])
            sh_level = recent_sh[-1, 1]

            sweep_depth = (high[i] - sh_level) * pip_mult
            if high[i] > sh_level and close[i] < sh_level and sweep_depth >= SWEEP_MIN_DEPTH_PIPS:
                records.append(_build_sweep_record(
                    i, "buyside_sweep", "SHORT", sh_level, sh_idx,
                    sweep_depth, timestamps, close, high, low, atr, sma_slope,
                    sessions, trading_dates, pip_mult,
                ))
                last_sweep_bar = i
                continue  # One sweep per bar

        # Check sellside sweep (break below swing low, close above)
        if len(recent_sl) > 0:
            sl_idx = int(recent_sl[-1, 0])
            sl_level = recent_sl[-1, 1]

            sweep_depth = (sl_level - low[i]) * pip_mult
            if low[i] < sl_level and close[i] > sl_level and sweep_depth >= SWEEP_MIN_DEPTH_PIPS:
                records.append(_build_sweep_record(
                    i, "sellside_sweep", "LONG", sl_level, sl_idx,
                    sweep_depth, timestamps, close, high, low, atr, sma_slope,
                    sessions, trading_dates, pip_mult,
                ))
                last_sweep_bar = i

    return pd.DataFrame(records)


def _build_sweep_record(
    i, sweep_type, direction, swing_price, swing_idx,
    sweep_depth_pips, timestamps, close, high, low, atr, sma_slope,
    sessions, trading_dates, pip_mult,
):
    """Build a single sweep detection record with outcomes."""
    n = len(close)
    sweep_depth_atr = sweep_depth_pips / (atr[i] * pip_mult) if not np.isnan(atr[i]) and atr[i] > 0 else np.nan
    bars_since_swing = i - swing_idx
    entry_price = close[i]
    hour_utc = pd.Timestamp(timestamps[i]).hour

    # ── Outcome labeling ────────────────────────────────────
    lookahead_end = min(i + 1 + SWEEP_LOOKAHEAD_BARS, n)

    max_favorable = 0.0
    max_adverse = 0.0

    for j in range(i + 1, lookahead_end):
        if direction == "SHORT":
            favorable = (entry_price - low[j]) * pip_mult
            adverse = (high[j] - entry_price) * pip_mult
        else:  # LONG
            favorable = (high[j] - entry_price) * pip_mult
            adverse = (entry_price - low[j]) * pip_mult

        max_favorable = max(max_favorable, favorable)
        max_adverse = max(max_adverse, adverse)

    atr_pips = atr[i] * pip_mult if not np.isnan(atr[i]) else 0
    reversed_1atr = max_favorable >= atr_pips if atr_pips > 0 else False
    reversed_2atr = max_favorable >= 2 * atr_pips if atr_pips > 0 else False
    positive_rr = max_favorable > max_adverse

    return {
        "datetime": timestamps[i],
        "trading_date": trading_dates[i],
        "type": sweep_type,
        "direction": direction,
        "swing_price": swing_price,
        "sweep_depth_pips": round(sweep_depth_pips, 2),
        "sweep_depth_atr": round(sweep_depth_atr, 4) if not np.isnan(sweep_depth_atr) else np.nan,
        "entry_price": entry_price,
        "session": sessions[i],
        "hour_utc": hour_utc,
        "sma_slope": sma_slope[i] * pip_mult if not np.isnan(sma_slope[i]) else np.nan,
        "bars_since_swing": bars_since_swing,
        "atr_pips": round(atr_pips, 2),
        # Outcomes
        "max_favorable_pips": round(max_favorable, 2),
        "max_adverse_pips": round(max_adverse, 2),
        "reversed_1atr": reversed_1atr,
        "reversed_2atr": reversed_2atr,
        "positive_rr": positive_rr,
    }


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min
    from forexedge_ict_engine.pipeline.indicators import add_indicators
    from forexedge_ict_engine.detectors.sessions import add_session_labels
    from forexedge_ict_engine.detectors.swings import detect_swings

    df = ingest_pair("EURUSD")
    df = resample_to_15min(df)
    df = add_indicators(df)
    df = add_session_labels(df)
    swings = detect_swings(df)

    sweeps = detect_sweeps(df, swings, pair="EURUSD")
    print(f"\nTotal sweeps: {len(sweeps):,}")
    print(f"Buyside:  {(sweeps['type'] == 'buyside_sweep').sum():,}")
    print(f"Sellside: {(sweeps['type'] == 'sellside_sweep').sum():,}")
    print(f"\nOutcome rates:")
    print(f"  Reversed 1 ATR: {sweeps['reversed_1atr'].mean():.1%}")
    print(f"  Reversed 2 ATR: {sweeps['reversed_2atr'].mean():.1%}")
    print(f"  Positive R:R:   {sweeps['positive_rr'].mean():.1%}")
