"""
Session Labeling & Kill Zone Analytics.

Labels each 15-min bar with its trading session. Computes per-session daily metrics.
HistData timestamps are fixed EST; we work in UTC after ingestion.
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import SESSIONS_UTC, SESSION_IB_BARS


def label_session(hour_utc: int) -> str:
    """Map a UTC hour to a session name.

    Sessions (UTC):
      Tokyo:     00:00 - 07:59
      London:    08:00 - 12:59
      New_York:  13:00 - 17:59
      Off_Hours: 18:00 - 23:59

    Overlap (13:00-16:59 UTC) is a subset of New_York, tracked separately.
    """
    if 0 <= hour_utc <= 7:
        return "Tokyo"
    elif 8 <= hour_utc <= 12:
        return "London"
    elif 13 <= hour_utc <= 17:
        return "New_York"
    else:
        return "Off_Hours"


def is_overlap(hour_utc: int) -> bool:
    """Check if hour falls in London-NY overlap (13:00-16:59 UTC)."""
    return 13 <= hour_utc <= 16


def add_session_labels(df: pd.DataFrame) -> pd.DataFrame:
    """Add session and overlap columns to 15-min DataFrame."""
    df = df.copy()
    hours = df["timestamp"].dt.hour
    df["session"] = hours.map(label_session)
    df["is_overlap"] = hours.map(is_overlap)
    df["hour_utc"] = hours
    return df


def compute_session_analytics(df: pd.DataFrame) -> pd.DataFrame:
    """Compute daily session analytics (kill zone metrics).

    For each (trading_date, session), compute:
    - session_high, session_low, session_range_pips
    - session_direction (1 if close > open of first bar, -1 otherwise)
    - IB high/low (first 4 bars = 1 hour)
    - IB break direction and magnitude
    - Gap from previous session close

    Returns one row per (trading_date, session).
    """
    if "session" not in df.columns:
        df = add_session_labels(df)

    records = []
    prev_session_close = None

    for (tdate, session), grp in df.groupby(["trading_date", "session"]):
        if len(grp) < 2:
            prev_session_close = grp["close"].iloc[-1] if len(grp) > 0 else prev_session_close
            continue

        session_high = grp["high"].max()
        session_low = grp["low"].min()
        session_open = grp["open"].iloc[0]
        session_close = grp["close"].iloc[-1]

        # Initial Balance (first SESSION_IB_BARS bars)
        ib = grp.iloc[:SESSION_IB_BARS]
        ib_high = ib["high"].max()
        ib_low = ib["low"].min()

        # IB break: which side broke first after IB period
        post_ib = grp.iloc[SESSION_IB_BARS:]
        ib_break_dir = "neither"
        ib_break_mag = 0.0
        for _, bar in post_ib.iterrows():
            if bar["high"] > ib_high and ib_break_dir == "neither":
                ib_break_dir = "up"
                ib_break_mag = bar["high"] - ib_high
                break
            if bar["low"] < ib_low and ib_break_dir == "neither":
                ib_break_dir = "down"
                ib_break_mag = ib_low - bar["low"]
                break

        # Gap from previous session
        gap = (session_open - prev_session_close) if prev_session_close is not None else 0.0

        records.append({
            "trading_date": tdate,
            "session": session,
            "session_high": session_high,
            "session_low": session_low,
            "session_range_pips": (session_high - session_low) * 10_000,
            "session_direction": 1 if session_close > session_open else -1,
            "session_open": session_open,
            "session_close": session_close,
            "ib_high": ib_high,
            "ib_low": ib_low,
            "ib_break_direction": ib_break_dir,
            "ib_break_magnitude_pips": ib_break_mag * 10_000,
            "gap_from_prev_session_pips": gap * 10_000,
        })

        prev_session_close = session_close

    return pd.DataFrame(records)


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min
    from forexedge_ict_engine.pipeline.indicators import add_indicators

    df_1min = ingest_pair("EURUSD")
    df_15min = resample_to_15min(df_1min)
    df_15min = add_indicators(df_15min)
    df_15min = add_session_labels(df_15min)

    print(f"\nSession distribution:")
    print(df_15min["session"].value_counts())
    print(f"\nOverlap bars: {df_15min['is_overlap'].sum():,}")

    analytics = compute_session_analytics(df_15min)
    print(f"\nSession analytics rows: {len(analytics):,}")
    print(analytics.head(10))
