"""
Data Ingestion — Load HistData 1-minute OHLCV CSVs, clean, convert to UTC.
"""

import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import ENGINE_DATA_ROOT, PIP_MULTIPLIER

warnings.filterwarnings("ignore", category=FutureWarning)


def load_pair_csv(filepath: Path) -> pd.DataFrame:
    """Load a single HistData CSV file.

    Format: YYYYMMDD HHMMSS;open;high;low;close;volume (no header, semicolon-delimited)
    Timestamps are fixed EST (UTC-5) year-round.
    """
    df = pd.read_csv(
        filepath,
        sep=";",
        header=None,
        names=["timestamp", "open", "high", "low", "close", "volume"],
        dtype={"timestamp": str},
    )

    df["timestamp"] = pd.to_datetime(df["timestamp"].str.strip(), format="%Y%m%d %H%M%S")

    # Convert fixed EST → UTC (+5 hours always, no DST)
    df["timestamp"] = df["timestamp"] + pd.Timedelta(hours=5)

    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0).astype(int)

    return df


def load_pair(pair: str, raw_dir: Path = None) -> pd.DataFrame:
    """Load all CSV files for a given pair, combine, sort, deduplicate."""
    if raw_dir is None:
        raw_dir = ENGINE_DATA_ROOT

    pair_dir = raw_dir / pair
    if not pair_dir.exists():
        raise FileNotFoundError(f"No data directory for {pair} at {pair_dir}")

    csv_files = sorted(pair_dir.glob("DAT_ASCII_*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {pair_dir}")

    frames = []
    for f in csv_files:
        print(f"  Loading {f.name}...")
        frames.append(load_pair_csv(f))

    df = pd.concat(frames, ignore_index=True)
    df = df.sort_values("timestamp").reset_index(drop=True)
    df = df.drop_duplicates(subset="timestamp", keep="first").reset_index(drop=True)

    return df


def clean_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Clean OHLCV data: remove weekends, NaN, fix high/low consistency."""
    # Remove NaN prices
    df = df.dropna(subset=["open", "high", "low", "close"]).copy()

    # Remove weekend bars (Saturday all day, Sunday before ~22:00 UTC, Friday after 22:00 UTC)
    dow = df["timestamp"].dt.dayofweek  # 0=Mon ... 6=Sun
    is_weekend = (
        (dow == 5) |  # Saturday
        ((dow == 6) & (df["timestamp"].dt.hour < 22)) |  # Sunday before 22:00 UTC
        ((dow == 4) & (df["timestamp"].dt.hour >= 22))    # Friday after 22:00 UTC
    )
    df = df[~is_weekend].copy()

    # Fix high/low consistency
    df["high"] = df[["open", "high", "low", "close"]].max(axis=1)
    df["low"] = df[["open", "high", "low", "close"]].min(axis=1)

    # Drop duplicates and sort
    df = df.drop_duplicates(subset="timestamp", keep="first")
    df = df.sort_values("timestamp").reset_index(drop=True)

    return df


def validate_data(df: pd.DataFrame, pair: str = "EURUSD") -> dict:
    """Validate data quality. Returns a summary dict."""
    summary = {
        "pair": pair,
        "rows": len(df),
        "date_range": f"{df['timestamp'].min()} to {df['timestamp'].max()}",
        "null_ohlc": int(df[["open", "high", "low", "close"]].isnull().sum().sum()),
        "duplicate_timestamps": int(df["timestamp"].duplicated().sum()),
        "zero_volume_pct": round(float((df["volume"] == 0).mean() * 100), 1),
    }

    # Gap detection: gaps > 5 minutes on weekdays
    ts = df["timestamp"]
    gaps = ts.diff().dt.total_seconds() / 60
    weekday_mask = ts.dt.dayofweek < 5
    big_gaps = gaps[(gaps > 5) & weekday_mask]
    summary["gaps_gt_5min"] = len(big_gaps)
    summary["max_gap_minutes"] = float(gaps.max()) if len(gaps) > 0 else 0

    return summary


def ingest_pair(pair: str = "EURUSD") -> pd.DataFrame:
    """Full ingestion pipeline: load → clean → validate."""
    print(f"\n{'='*60}")
    print(f"Ingesting {pair}")
    print(f"{'='*60}")

    df = load_pair(pair)
    print(f"  Raw rows: {len(df):,}")

    df = clean_ohlcv(df)
    print(f"  After cleaning: {len(df):,}")

    stats = validate_data(df, pair)
    print(f"  Date range: {stats['date_range']}")
    print(f"  Null OHLC: {stats['null_ohlc']}")
    print(f"  Duplicate timestamps: {stats['duplicate_timestamps']}")
    print(f"  Zero volume: {stats['zero_volume_pct']}%")
    print(f"  Gaps > 5min (weekday): {stats['gaps_gt_5min']}")

    return df


if __name__ == "__main__":
    df = ingest_pair("EURUSD")
    print(f"\nFinal shape: {df.shape}")
    print(df.head())
    print(df.tail())
