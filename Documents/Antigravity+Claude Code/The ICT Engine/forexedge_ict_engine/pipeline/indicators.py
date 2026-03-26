"""
Technical Indicators — computed on 15-min candles.

ATR-14, SMA-50, SMA Slope, StdDev-14.
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import ATR_PERIOD, SMA_PERIOD, SMA_SLOPE_LOOKBACK, STDDEV_PERIOD


def compute_true_range(df: pd.DataFrame) -> pd.Series:
    """True Range = max(high-low, |high-prev_close|, |low-prev_close|)."""
    prev_close = df["close"].shift(1)
    tr1 = df["high"] - df["low"]
    tr2 = (df["high"] - prev_close).abs()
    tr3 = (df["low"] - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add ATR-14, SMA-50, SMA slope, StdDev-14 to 15-min DataFrame.

    Computes indicators using a rolling window across the full series
    (not reset per trading day — the spec says 'per trading day' but
    rolling indicators need continuity for warm-up).
    """
    df = df.copy()

    # True Range and ATR-14
    df["true_range"] = compute_true_range(df)
    df["atr_14"] = df["true_range"].rolling(window=ATR_PERIOD, min_periods=ATR_PERIOD).mean()

    # SMA-50 of close
    df["sma_50"] = df["close"].rolling(window=SMA_PERIOD, min_periods=SMA_PERIOD).mean()

    # SMA Slope: (SMA_50 - SMA_50[10 bars ago]) * pip_multiplier
    # Store as raw diff first; caller can multiply by pip_multiplier for specific pair
    df["sma_slope"] = df["sma_50"] - df["sma_50"].shift(SMA_SLOPE_LOOKBACK)

    # StdDev-14 of returns, in price space
    returns = df["close"].pct_change()
    df["stddev_14"] = returns.rolling(window=STDDEV_PERIOD, min_periods=STDDEV_PERIOD).std() * df["close"]

    return df


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min

    df_1min = ingest_pair("EURUSD")
    df_15min = resample_to_15min(df_1min)
    df_15min = add_indicators(df_15min)

    print(f"\nWith indicators: {len(df_15min):,} rows")
    print(f"ATR-14 non-null: {df_15min['atr_14'].notna().sum():,}")
    print(f"SMA-50 non-null: {df_15min['sma_50'].notna().sum():,}")
    print(f"\nSample (row 100-110):")
    print(df_15min.iloc[100:110][["timestamp", "close", "atr_14", "sma_50", "sma_slope", "stddev_14"]])
