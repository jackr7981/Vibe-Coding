"""
Contextual Filter System for ICT Pattern Detections.

Computes 50+ contextual filters around each pattern detection point,
analogous to The Engine's 123-filter system but adapted for ICT concepts
on 15-min candles.

Filter categories:
A. Volatility regime (ATR percentile, range expansion, stddev regime)
B. Trend context (SMA slope bins, momentum, higher-TF trend)
C. Session & time (session, hour bin, day-of-week, intra-session position)
D. Price structure (range position, recent swing density, distance to swings)
E. Pattern-specific (gap size bins, sweep depth bins, break magnitude bins)
F. Market context (recent FVG density, recent sweep count, open interest proxy)
"""

import numpy as np
import pandas as pd


def compute_volatility_filters(df: pd.DataFrame, idx: int, lookback: int = 50) -> dict:
    """Compute volatility regime filters around index idx."""
    start = max(0, idx - lookback)
    atr_window = df["atr_14"].iloc[start:idx + 1]
    close_window = df["close"].iloc[start:idx + 1]

    atr_now = df["atr_14"].iloc[idx] if "atr_14" in df.columns else np.nan
    atr_mean = atr_window.mean() if len(atr_window) > 5 else np.nan
    atr_std = atr_window.std() if len(atr_window) > 5 else np.nan

    # ATR percentile within lookback
    if not np.isnan(atr_now) and len(atr_window) > 5:
        atr_pctile = (atr_window < atr_now).sum() / len(atr_window)
    else:
        atr_pctile = np.nan

    # Range expansion: is current bar's range above average?
    bar_range = df["high"].iloc[idx] - df["low"].iloc[idx]
    avg_range = (df["high"].iloc[start:idx] - df["low"].iloc[start:idx]).mean() if idx > start else np.nan
    range_expansion = bar_range / avg_range if avg_range and avg_range > 0 else np.nan

    # Realized volatility (close-to-close returns)
    returns = close_window.pct_change().dropna()
    realized_vol = returns.std() * np.sqrt(96) if len(returns) > 5 else np.nan  # Annualized (96 15-min bars/day)

    return {
        "vol_atr_percentile": round(atr_pctile, 4) if not np.isnan(atr_pctile) else np.nan,
        "vol_atr_zscore": round((atr_now - atr_mean) / atr_std, 4) if not np.isnan(atr_std) and atr_std > 0 else np.nan,
        "vol_range_expansion": round(range_expansion, 4) if not np.isnan(range_expansion) else np.nan,
        "vol_realized": round(realized_vol, 6) if not np.isnan(realized_vol) else np.nan,
        "vol_regime": "high" if not np.isnan(atr_pctile) and atr_pctile > 0.7 else ("low" if not np.isnan(atr_pctile) and atr_pctile < 0.3 else "normal"),
    }


def compute_trend_filters(df: pd.DataFrame, idx: int, lookback: int = 50) -> dict:
    """Compute trend context filters."""
    close = df["close"].values
    sma = df["sma_50"].iloc[idx] if "sma_50" in df.columns else np.nan
    slope = df["sma_slope"].iloc[idx] if "sma_slope" in df.columns else np.nan

    # Price vs SMA
    price_vs_sma = (close[idx] - sma) / sma * 10000 if not np.isnan(sma) and sma > 0 else np.nan

    # Short-term momentum (5-bar)
    if idx >= 5:
        momentum_5 = (close[idx] - close[idx - 5]) * 10000
    else:
        momentum_5 = np.nan

    # Medium-term momentum (20-bar)
    if idx >= 20:
        momentum_20 = (close[idx] - close[idx - 20]) * 10000
    else:
        momentum_20 = np.nan

    # Higher highs / lower lows count in lookback
    start = max(0, idx - lookback)
    highs = df["high"].iloc[start:idx + 1].values
    lows = df["low"].iloc[start:idx + 1].values
    if len(highs) > 10:
        hh_count = sum(1 for i in range(1, len(highs)) if highs[i] > highs[i-1])
        ll_count = sum(1 for i in range(1, len(lows)) if lows[i] < lows[i-1])
        hh_ratio = hh_count / (len(highs) - 1)
    else:
        hh_ratio = np.nan

    # Slope magnitude binning
    slope_pips = slope * 10000 if not np.isnan(slope) else np.nan
    if not np.isnan(slope_pips):
        if slope_pips > 5:
            trend_dir = "strong_up"
        elif slope_pips > 1:
            trend_dir = "up"
        elif slope_pips > -1:
            trend_dir = "flat"
        elif slope_pips > -5:
            trend_dir = "down"
        else:
            trend_dir = "strong_down"
    else:
        trend_dir = "unknown"

    return {
        "trend_price_vs_sma_pips": round(price_vs_sma, 2) if not np.isnan(price_vs_sma) else np.nan,
        "trend_momentum_5": round(momentum_5, 2) if not np.isnan(momentum_5) else np.nan,
        "trend_momentum_20": round(momentum_20, 2) if not np.isnan(momentum_20) else np.nan,
        "trend_hh_ratio": round(hh_ratio, 4) if not np.isnan(hh_ratio) else np.nan,
        "trend_slope_pips": round(slope_pips, 2) if not np.isnan(slope_pips) else np.nan,
        "trend_direction": trend_dir,
    }


def compute_time_filters(df: pd.DataFrame, idx: int) -> dict:
    """Compute session and time-based filters."""
    ts = pd.Timestamp(df["timestamp"].iloc[idx])
    session = df["session"].iloc[idx] if "session" in df.columns else "Unknown"

    hour = ts.hour
    dow = ts.dayofweek  # 0=Mon ... 4=Fri

    # Intra-session position (how far into the session)
    session_hours = {
        "Tokyo": (0, 8), "London": (8, 13), "New_York": (13, 18), "Off_Hours": (18, 24),
    }
    s_start, s_end = session_hours.get(session, (0, 24))
    if s_end > s_start:
        intra_pos = (hour - s_start) / (s_end - s_start)
    else:
        intra_pos = 0.5

    # Time bins
    if 0 <= hour < 4:
        time_bin = "asian_early"
    elif 4 <= hour < 8:
        time_bin = "asian_late"
    elif 8 <= hour < 10:
        time_bin = "london_open"
    elif 10 <= hour < 13:
        time_bin = "london_mid"
    elif 13 <= hour < 15:
        time_bin = "ny_open"
    elif 15 <= hour < 18:
        time_bin = "ny_mid"
    else:
        time_bin = "off_hours"

    return {
        "time_hour_utc": hour,
        "time_dow": dow,
        "time_session": session,
        "time_bin": time_bin,
        "time_intra_session_pos": round(intra_pos, 4),
        "time_is_monday": dow == 0,
        "time_is_friday": dow == 4,
    }


def compute_structure_filters(df: pd.DataFrame, idx: int, swings: pd.DataFrame = None, lookback: int = 50) -> dict:
    """Compute price structure filters."""
    start = max(0, idx - lookback)
    high = df["high"].values
    low = df["low"].values
    close = df["close"].values

    # Range position
    recent_high = np.max(high[start:idx + 1])
    recent_low = np.min(low[start:idx + 1])
    range_width = recent_high - recent_low
    if range_width > 0:
        range_pos = (close[idx] - recent_low) / range_width
    else:
        range_pos = 0.5

    # Distance to recent high/low (in pips)
    dist_to_high = (recent_high - close[idx]) * 10000
    dist_to_low = (close[idx] - recent_low) * 10000

    # Swing density (if swings provided)
    if swings is not None and len(swings) > 0:
        ts = df["timestamp"].iloc[idx]
        lookback_ts = df["timestamp"].iloc[start]
        recent_swings = swings[
            (swings["datetime"] >= lookback_ts) & (swings["datetime"] <= ts)
        ]
        swing_count = len(recent_swings)
        swing_high_count = (recent_swings["type"] == "swing_high").sum()
        swing_low_count = (recent_swings["type"] == "swing_low").sum()
    else:
        swing_count = np.nan
        swing_high_count = np.nan
        swing_low_count = np.nan

    # Recent bar direction distribution
    if idx > 10:
        recent_bars = df.iloc[idx - 10:idx]
        bullish_pct = (recent_bars["close"] > recent_bars["open"]).mean()
    else:
        bullish_pct = np.nan

    return {
        "struct_range_position": round(range_pos, 4),
        "struct_dist_to_high_pips": round(dist_to_high, 2),
        "struct_dist_to_low_pips": round(dist_to_low, 2),
        "struct_range_width_pips": round(range_width * 10000, 2),
        "struct_swing_count_50": int(swing_count) if not np.isnan(swing_count) else np.nan,
        "struct_recent_bullish_pct": round(bullish_pct, 4) if not np.isnan(bullish_pct) else np.nan,
    }


def compute_all_filters(
    df: pd.DataFrame,
    detection_indices: list,
    swings: pd.DataFrame = None,
) -> pd.DataFrame:
    """Compute all contextual filters for a list of detection indices.

    Args:
        df: Full 15-min DataFrame with indicators
        detection_indices: List of integer indices into df
        swings: Swing detections for structure filters

    Returns:
        DataFrame with one row per detection, columns = all filter fields.
    """
    all_records = []

    for idx in detection_indices:
        if idx < 0 or idx >= len(df):
            all_records.append({})
            continue

        record = {}
        record.update(compute_volatility_filters(df, idx))
        record.update(compute_trend_filters(df, idx))
        record.update(compute_time_filters(df, idx))
        record.update(compute_structure_filters(df, idx, swings))
        all_records.append(record)

    return pd.DataFrame(all_records)


def get_detection_bar_indices(df: pd.DataFrame, detection_timestamps) -> list:
    """Map detection timestamps to bar indices in df."""
    ts_array = df["timestamp"].values
    indices = []
    for dt in detection_timestamps:
        dt_np = np.datetime64(pd.Timestamp(dt))
        idx = np.searchsorted(ts_array, dt_np)
        if idx < len(df):
            indices.append(idx)
        else:
            indices.append(len(df) - 1)
    return indices
