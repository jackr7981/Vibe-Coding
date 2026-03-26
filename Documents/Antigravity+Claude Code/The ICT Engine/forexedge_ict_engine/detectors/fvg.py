"""
Fair Value Gap (FVG) Detector.

Detects bullish and bearish FVGs on 15-min OHLCV data.
Labels outcomes: touched, filled, held within 96-bar lookahead (24 hours).
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import (
    FVG_LOOKAHEAD_BARS, RANGE_POSITION_LOOKBACK, PIP_MULTIPLIER,
)


def detect_fvg(df: pd.DataFrame, pair: str = "EURUSD") -> pd.DataFrame:
    """Detect all Fair Value Gaps in 15-min OHLCV data.

    Bullish FVG: high[i-2] < low[i] — gap between candle 1's high and candle 3's low
    Bearish FVG: low[i-2] > high[i] — gap between candle 1's low and candle 3's high

    Args:
        df: 15-min OHLCV DataFrame with columns: timestamp, open, high, low, close,
            atr_14, sma_50, sma_slope, session, trading_date
        pair: Currency pair name for pip conversion

    Returns:
        DataFrame with one row per FVG instance and all metadata + outcomes.
    """
    pip_mult = PIP_MULTIPLIER.get(pair, 10_000)
    records = []

    high = df["high"].values
    low = df["low"].values
    close = df["close"].values
    open_ = df["open"].values
    timestamps = df["timestamp"].values
    atr = df["atr_14"].values if "atr_14" in df.columns else np.full(len(df), np.nan)
    sma_slope = df["sma_slope"].values if "sma_slope" in df.columns else np.full(len(df), np.nan)
    sessions = df["session"].values if "session" in df.columns else np.full(len(df), "Unknown")
    trading_dates = df["trading_date"].values if "trading_date" in df.columns else np.full(len(df), None)

    for i in range(2, len(df)):
        bullish = high[i - 2] < low[i]
        bearish = low[i - 2] > high[i]

        if not bullish and not bearish:
            continue

        if bullish:
            fvg_type = "bullish"
            gap_top = low[i]        # candle 3's low
            gap_bottom = high[i - 2]  # candle 1's high
        else:
            fvg_type = "bearish"
            gap_top = low[i - 2]    # candle 1's low
            gap_bottom = high[i]     # candle 3's high

        gap_pips = (gap_top - gap_bottom) * pip_mult
        if gap_pips <= 0:
            continue  # Sanity check

        gap_atr_ratio = gap_pips / (atr[i] * pip_mult) if not np.isnan(atr[i]) and atr[i] > 0 else np.nan
        hour = pd.Timestamp(timestamps[i]).hour

        # Range position: where FVG midpoint sits in recent 50-bar range
        lookback_start = max(0, i - RANGE_POSITION_LOOKBACK)
        recent_high = np.max(high[lookback_start:i + 1])
        recent_low = np.min(low[lookback_start:i + 1])
        fvg_mid = (gap_top + gap_bottom) / 2
        range_position = (fvg_mid - recent_low) / (recent_high - recent_low) if recent_high > recent_low else 0.5

        # ── Outcome labeling (lookahead) ────────────────────────────────
        touched = False
        filled = False
        touch_bars = np.nan
        fill_bars = np.nan

        lookahead_end = min(i + 1 + FVG_LOOKAHEAD_BARS, len(df))
        for j in range(i + 1, lookahead_end):
            if bullish:
                # Touched: price enters FVG zone (low <= gap_top)
                if not touched and low[j] <= gap_top:
                    touched = True
                    touch_bars = j - i
                # Filled: price passes through entire FVG (low <= gap_bottom)
                if not filled and low[j] <= gap_bottom:
                    filled = True
                    fill_bars = j - i
            else:
                # Bearish: touched = high >= gap_bottom, filled = high >= gap_top
                if not touched and high[j] >= gap_bottom:
                    touched = True
                    touch_bars = j - i
                if not filled and high[j] >= gap_top:
                    filled = True
                    fill_bars = j - i

            if touched and filled:
                break

        held = touched and not filled

        records.append({
            "datetime": timestamps[i],
            "trading_date": trading_dates[i],
            "type": fvg_type,
            "gap_top": gap_top,
            "gap_bottom": gap_bottom,
            "gap_pips": round(gap_pips, 2),
            "gap_atr_ratio": round(gap_atr_ratio, 4) if not np.isnan(gap_atr_ratio) else np.nan,
            "session": sessions[i],
            "hour_utc": hour,
            "sma_slope": sma_slope[i] * pip_mult if not np.isnan(sma_slope[i]) else np.nan,
            "range_position": round(range_position, 4),
            "atr_pips": round(atr[i] * pip_mult, 2) if not np.isnan(atr[i]) else np.nan,
            # Outcomes
            "touched": touched,
            "filled": filled,
            "held": held,
            "touch_bars": touch_bars,
            "fill_bars": fill_bars,
        })

    result = pd.DataFrame(records)
    return result


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min
    from forexedge_ict_engine.pipeline.indicators import add_indicators
    from forexedge_ict_engine.detectors.sessions import add_session_labels

    df = ingest_pair("EURUSD")
    df = resample_to_15min(df)
    df = add_indicators(df)
    df = add_session_labels(df)

    fvgs = detect_fvg(df, pair="EURUSD")
    print(f"\nTotal FVGs detected: {len(fvgs):,}")
    print(f"Bullish: {(fvgs['type'] == 'bullish').sum():,}")
    print(f"Bearish: {(fvgs['type'] == 'bearish').sum():,}")
    print(f"\nOutcome rates:")
    print(f"  Touched: {fvgs['touched'].mean():.1%}")
    print(f"  Filled:  {fvgs['filled'].mean():.1%}")
    print(f"  Held:    {fvgs['held'].mean():.1%}")
    print(f"\nBy session:")
    print(fvgs.groupby("session")["filled"].agg(["count", "mean"]))
