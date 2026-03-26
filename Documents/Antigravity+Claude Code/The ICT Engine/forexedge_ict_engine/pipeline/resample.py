"""
Resample 1-minute OHLCV to 15-minute candles, grouped by trading day.

A forex trading day runs 17:00 EST (22:00 UTC) to 17:00 EST next day.
"""

import pandas as pd

from forexedge_ict_engine.config import RESAMPLE_TF, TRADING_DAY_ROLLOVER_HOUR_EST


# Trading day rollover in UTC: 17:00 EST = 22:00 UTC
ROLLOVER_HOUR_UTC = TRADING_DAY_ROLLOVER_HOUR_EST + 5  # = 22


def assign_trading_date(df: pd.DataFrame) -> pd.DataFrame:
    """Assign a trading_date to each bar.

    Forex trading day: 22:00 UTC day N → 21:59 UTC day N+1
    Bars from 22:00 UTC onward belong to the NEXT calendar day's trading session.
    """
    df = df.copy()
    # Shift timestamps back by rollover hour so that bars after 22:00 UTC
    # map to the next calendar day
    shifted = df["timestamp"] - pd.Timedelta(hours=ROLLOVER_HOUR_UTC)
    df["trading_date"] = shifted.dt.date
    return df


def resample_to_15min(df: pd.DataFrame) -> pd.DataFrame:
    """Resample 1-min bars to 15-min candles within each trading day.

    Returns DataFrame with timestamp index and columns:
    open, high, low, close, volume, trading_date
    """
    if "trading_date" not in df.columns:
        df = assign_trading_date(df)

    df = df.set_index("timestamp")

    resampled_frames = []
    for tdate, grp in df.groupby("trading_date"):
        if len(grp) < 15:
            continue  # Skip tiny fragments

        r = grp.resample(RESAMPLE_TF).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna(subset=["open"])

        r["trading_date"] = tdate
        resampled_frames.append(r)

    if not resampled_frames:
        return pd.DataFrame()

    result = pd.concat(resampled_frames)
    result = result.sort_index()
    result = result.reset_index()  # timestamp back as column

    return result


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair

    df_1min = ingest_pair("EURUSD")
    df_15min = resample_to_15min(df_1min)

    print(f"\n15-min candles: {len(df_15min):,}")
    print(f"Trading days: {df_15min['trading_date'].nunique()}")
    print(f"Date range: {df_15min['timestamp'].min()} to {df_15min['timestamp'].max()}")
    print(f"\nSample:\n{df_15min.head(10)}")
