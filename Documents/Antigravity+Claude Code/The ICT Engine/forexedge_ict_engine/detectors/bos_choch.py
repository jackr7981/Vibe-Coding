"""
Break of Structure (BOS) & Change of Character (CHOCH) Detector.

BOS: Price breaks a swing level in the direction of the current trend (continuation).
CHOCH: Price breaks a swing level against the current trend (reversal).

Break condition: close[i] crosses the swing level (close-based break).
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import BOS_LOOKAHEAD_BARS, PIP_MULTIPLIER


def detect_bos_choch(
    df: pd.DataFrame,
    swings: pd.DataFrame,
    pair: str = "EURUSD",
) -> pd.DataFrame:
    """Detect BOS and CHOCH events.

    Implementation:
    1. Track swing high/low sequence
    2. Determine trend state (uptrend = HH+HL, downtrend = LH+LL)
    3. When close breaks a swing level, classify as BOS or CHOCH

    Args:
        df: 15-min OHLCV DataFrame with indicators and session labels
        swings: Output from detect_swings()
        pair: Currency pair

    Returns:
        DataFrame with BOS/CHOCH detections, metadata, and outcomes.
    """
    pip_mult = PIP_MULTIPLIER.get(pair, 10_000)

    close = df["close"].values
    high = df["high"].values
    low = df["low"].values
    timestamps = df["timestamp"].values
    atr = df["atr_14"].values if "atr_14" in df.columns else np.full(len(df), np.nan)
    sma_slope = df["sma_slope"].values if "sma_slope" in df.columns else np.full(len(df), np.nan)
    sessions = df["session"].values if "session" in df.columns else np.full(len(df), "Unknown")
    trading_dates = df["trading_date"].values if "trading_date" in df.columns else np.full(len(df), None)

    # Sort swings by bar_index
    swings_sorted = swings.sort_values("bar_index").reset_index(drop=True)

    # Build alternating swing sequence (high, low, high, low...)
    # Track the last two swing highs and last two swing lows
    swing_highs = []  # (bar_index, level)
    swing_lows = []
    all_swings = []  # chronological list of (bar_index, type, level)

    for _, row in swings_sorted.iterrows():
        if row["type"] == "swing_high":
            swing_highs.append((int(row["bar_index"]), row["level"]))
        else:
            swing_lows.append((int(row["bar_index"]), row["level"]))
        all_swings.append((int(row["bar_index"]), row["type"], row["level"]))

    records = []
    trend = "neutral"  # "uptrend", "downtrend", "neutral"
    trend_start_idx = 0

    # Process bar by bar, checking for breaks of most recent swing levels
    swing_idx = 0  # pointer into all_swings
    recent_sh = []  # last 2 swing highs: [(idx, level), ...]
    recent_sl = []  # last 2 swing lows

    last_break_bar = -5  # Prevent rapid-fire detections

    for i in range(len(df)):
        # Add any swings confirmed by bar i (swing bar_index <= i - 2 due to confirmation delay)
        while swing_idx < len(all_swings) and all_swings[swing_idx][0] <= i - 2:
            s_bar, s_type, s_level = all_swings[swing_idx]
            if s_type == "swing_high":
                recent_sh.append((s_bar, s_level))
                if len(recent_sh) > 2:
                    recent_sh = recent_sh[-2:]
            else:
                recent_sl.append((s_bar, s_level))
                if len(recent_sl) > 2:
                    recent_sl = recent_sl[-2:]
            swing_idx += 1

        # Update trend state
        if len(recent_sh) >= 2 and len(recent_sl) >= 2:
            hh = recent_sh[-1][1] > recent_sh[-2][1]  # Higher high
            hl = recent_sl[-1][1] > recent_sl[-2][1]  # Higher low
            lh = recent_sh[-1][1] < recent_sh[-2][1]  # Lower high
            ll = recent_sl[-1][1] < recent_sl[-2][1]  # Lower low

            if hh and hl:
                if trend != "uptrend":
                    trend = "uptrend"
                    trend_start_idx = i
            elif lh and ll:
                if trend != "downtrend":
                    trend = "downtrend"
                    trend_start_idx = i

        if i - last_break_bar < 3:
            continue

        # Check for breaks
        # Bullish break: close above most recent swing high
        if len(recent_sh) > 0:
            sh_bar, sh_level = recent_sh[-1]
            if close[i] > sh_level and close[i - 1] <= sh_level:
                if trend == "uptrend":
                    event_type = "bullish_bos"
                    break_dir = "bullish"
                elif trend == "downtrend":
                    event_type = "bullish_choch"
                    break_dir = "bullish"
                else:
                    event_type = "bullish_bos"
                    break_dir = "bullish"

                records.append(_build_bos_record(
                    i, event_type, break_dir, sh_level, trend_start_idx,
                    timestamps, close, high, low, atr, sma_slope,
                    sessions, trading_dates, pip_mult,
                ))
                last_break_bar = i
                continue

        # Bearish break: close below most recent swing low
        if len(recent_sl) > 0:
            sl_bar, sl_level = recent_sl[-1]
            if close[i] < sl_level and close[i - 1] >= sl_level:
                if trend == "downtrend":
                    event_type = "bearish_bos"
                    break_dir = "bearish"
                elif trend == "uptrend":
                    event_type = "bearish_choch"
                    break_dir = "bearish"
                else:
                    event_type = "bearish_bos"
                    break_dir = "bearish"

                records.append(_build_bos_record(
                    i, event_type, break_dir, sl_level, trend_start_idx,
                    timestamps, close, high, low, atr, sma_slope,
                    sessions, trading_dates, pip_mult,
                ))
                last_break_bar = i

    return pd.DataFrame(records)


def _build_bos_record(
    i, event_type, break_dir, level, trend_start_idx,
    timestamps, close, high, low, atr, sma_slope,
    sessions, trading_dates, pip_mult,
):
    """Build a BOS/CHOCH detection record with outcomes."""
    n = len(close)
    break_magnitude = abs(close[i] - level) * pip_mult
    break_magnitude_atr = break_magnitude / (atr[i] * pip_mult) if not np.isnan(atr[i]) and atr[i] > 0 else np.nan
    trend_duration = i - trend_start_idx
    hour_utc = pd.Timestamp(timestamps[i]).hour

    # Outcome labeling
    lookahead_end = min(i + 1 + BOS_LOOKAHEAD_BARS, n)

    max_continuation = 0.0
    max_pullback = 0.0

    for j in range(i + 1, lookahead_end):
        if break_dir == "bullish":
            continuation = (high[j] - close[i]) * pip_mult
            pullback = (close[i] - low[j]) * pip_mult
        else:
            continuation = (close[i] - low[j]) * pip_mult
            pullback = (high[j] - close[i]) * pip_mult

        max_continuation = max(max_continuation, continuation)
        max_pullback = max(max_pullback, pullback)

    atr_pips = atr[i] * pip_mult if not np.isnan(atr[i]) else 0
    followed_1atr = max_continuation >= atr_pips if atr_pips > 0 else False
    followed_2atr = max_continuation >= 2 * atr_pips if atr_pips > 0 else False
    positive_rr = max_continuation > max_pullback

    return {
        "datetime": timestamps[i],
        "trading_date": trading_dates[i],
        "type": event_type,
        "break_direction": break_dir,
        "level": level,
        "break_bar_close": close[i],
        "break_magnitude_pips": round(break_magnitude, 2),
        "break_magnitude_atr": round(break_magnitude_atr, 4) if not np.isnan(break_magnitude_atr) else np.nan,
        "trend_duration": trend_duration,
        "session": sessions[i],
        "hour_utc": hour_utc,
        "sma_slope": sma_slope[i] * pip_mult if not np.isnan(sma_slope[i]) else np.nan,
        "atr_pips": round(atr_pips, 2),
        # Outcomes
        "max_continuation_pips": round(max_continuation, 2),
        "max_pullback_pips": round(max_pullback, 2),
        "followed_through_1atr": followed_1atr,
        "followed_through_2atr": followed_2atr,
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

    bos = detect_bos_choch(df, swings, pair="EURUSD")
    print(f"\nTotal BOS/CHOCH: {len(bos):,}")
    for t in bos["type"].value_counts().items():
        print(f"  {t[0]}: {t[1]:,}")
    print(f"\nOutcome rates:")
    print(f"  Followed 1 ATR: {bos['followed_through_1atr'].mean():.1%}")
    print(f"  Followed 2 ATR: {bos['followed_through_2atr'].mean():.1%}")
    print(f"  Positive R:R:   {bos['positive_rr'].mean():.1%}")
