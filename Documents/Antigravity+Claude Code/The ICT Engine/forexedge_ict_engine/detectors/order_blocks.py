"""
Order Block Detector.

Bullish OB: Last bearish candle (close < open) before an impulsive bullish move (BOS/CHOCH).
Bearish OB: Last bullish candle (close > open) before an impulsive bearish move.

When price returns to this zone, it may act as support/resistance.
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import OB_LOOKAHEAD_BARS, PIP_MULTIPLIER, RANGE_POSITION_LOOKBACK


def detect_order_blocks(
    df: pd.DataFrame,
    bos_choch: pd.DataFrame,
    pair: str = "EURUSD",
) -> pd.DataFrame:
    """Detect Order Blocks tied to BOS/CHOCH events.

    For each break event, look backwards to find the last candle where close
    was on the opposite side of open.

    Args:
        df: 15-min OHLCV DataFrame with indicators and session labels
        bos_choch: Output from detect_bos_choch()
        pair: Currency pair

    Returns:
        DataFrame with OB detections, metadata, and outcomes.
    """
    pip_mult = PIP_MULTIPLIER.get(pair, 10_000)

    open_ = df["open"].values
    high = df["high"].values
    low = df["low"].values
    close = df["close"].values
    timestamps = df["timestamp"].values
    atr = df["atr_14"].values if "atr_14" in df.columns else np.full(len(df), np.nan)
    sma_slope = df["sma_slope"].values if "sma_slope" in df.columns else np.full(len(df), np.nan)
    sessions = df["session"].values if "session" in df.columns else np.full(len(df), "Unknown")
    trading_dates = df["trading_date"].values if "trading_date" in df.columns else np.full(len(df), None)

    records = []
    used_ob_bars = set()  # Prevent duplicate OBs

    for _, break_event in bos_choch.iterrows():
        break_ts = break_event["datetime"]
        break_dir = break_event["break_direction"]

        # Find the bar index of the break event
        break_ts_np = np.datetime64(pd.Timestamp(break_ts))
        break_idx = np.searchsorted(timestamps, break_ts_np)
        if break_idx >= len(df) or break_idx < 5:
            continue

        # Look backwards to find the OB candle
        ob_idx = None
        for j in range(break_idx - 1, max(break_idx - 20, 0), -1):
            if break_dir == "bullish":
                # Bullish break → find last bearish candle (close < open)
                if close[j] < open_[j]:
                    ob_idx = j
                    break
            else:
                # Bearish break → find last bullish candle (close > open)
                if close[j] > open_[j]:
                    ob_idx = j
                    break

        if ob_idx is None or ob_idx in used_ob_bars:
            continue

        used_ob_bars.add(ob_idx)

        ob_type = "bullish_ob" if break_dir == "bullish" else "bearish_ob"
        ob_top = high[ob_idx]
        ob_bottom = low[ob_idx]
        ob_size_pips = (ob_top - ob_bottom) * pip_mult
        ob_size_atr = ob_size_pips / (atr[ob_idx] * pip_mult) if not np.isnan(atr[ob_idx]) and atr[ob_idx] > 0 else np.nan
        hour_utc = pd.Timestamp(timestamps[ob_idx]).hour

        # Range position
        lookback_start = max(0, ob_idx - RANGE_POSITION_LOOKBACK)
        recent_high = np.max(high[lookback_start:ob_idx + 1])
        recent_low = np.min(low[lookback_start:ob_idx + 1])
        ob_mid = (ob_top + ob_bottom) / 2
        range_position = (ob_mid - recent_low) / (recent_high - recent_low) if recent_high > recent_low else 0.5

        trigger = "choch" if "choch" in break_event["type"] else "bos"

        # Outcome labeling (from the BREAK event, not OB formation)
        n = len(df)
        lookahead_start = break_idx + 1
        lookahead_end = min(break_idx + 1 + OB_LOOKAHEAD_BARS, n)

        touched = False
        filled = False
        touch_bars = np.nan
        fill_bars = np.nan

        for k in range(lookahead_start, lookahead_end):
            if ob_type == "bullish_ob":
                # Bullish OB: touched = low <= ob_top, filled = low <= ob_bottom
                if not touched and low[k] <= ob_top:
                    touched = True
                    touch_bars = k - break_idx
                if not filled and low[k] <= ob_bottom:
                    filled = True
                    fill_bars = k - break_idx
            else:
                # Bearish OB: touched = high >= ob_bottom, filled = high >= ob_top
                if not touched and high[k] >= ob_bottom:
                    touched = True
                    touch_bars = k - break_idx
                if not filled and high[k] >= ob_top:
                    filled = True
                    fill_bars = k - break_idx

            if touched and filled:
                break

        held = touched and not filled

        records.append({
            "datetime": timestamps[ob_idx],
            "trading_date": trading_dates[ob_idx],
            "type": ob_type,
            "ob_top": ob_top,
            "ob_bottom": ob_bottom,
            "ob_size_pips": round(ob_size_pips, 2),
            "ob_size_atr": round(ob_size_atr, 4) if not np.isnan(ob_size_atr) else np.nan,
            "trigger_event": trigger,
            "session": sessions[ob_idx],
            "hour_utc": hour_utc,
            "sma_slope": sma_slope[ob_idx] * pip_mult if not np.isnan(sma_slope[ob_idx]) else np.nan,
            "range_position": round(range_position, 4),
            "atr_pips": round(atr[ob_idx] * pip_mult, 2) if not np.isnan(atr[ob_idx]) else np.nan,
            # Outcomes
            "touched": touched,
            "filled": filled,
            "held": held,
            "touch_bars": touch_bars,
            "fill_bars": fill_bars,
        })

    return pd.DataFrame(records)


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min
    from forexedge_ict_engine.pipeline.indicators import add_indicators
    from forexedge_ict_engine.detectors.sessions import add_session_labels
    from forexedge_ict_engine.detectors.swings import detect_swings
    from forexedge_ict_engine.detectors.bos_choch import detect_bos_choch

    df = ingest_pair("EURUSD")
    df = resample_to_15min(df)
    df = add_indicators(df)
    df = add_session_labels(df)
    swings = detect_swings(df)
    bos = detect_bos_choch(df, swings, pair="EURUSD")

    obs = detect_order_blocks(df, bos, pair="EURUSD")
    print(f"\nTotal OBs: {len(obs):,}")
    print(f"Bullish: {(obs['type'] == 'bullish_ob').sum():,}")
    print(f"Bearish: {(obs['type'] == 'bearish_ob').sum():,}")
    print(f"\nOutcome rates:")
    print(f"  Touched: {obs['touched'].mean():.1%}")
    print(f"  Filled:  {obs['filled'].mean():.1%}")
    print(f"  Held:    {obs['held'].mean():.1%}")
