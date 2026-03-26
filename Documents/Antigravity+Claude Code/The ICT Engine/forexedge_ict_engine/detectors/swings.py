"""
Swing High/Low Detector — 5-bar fractal.

Swing High: high[i] > high[i-1] AND high[i] > high[i-2] AND high[i] > high[i+1] AND high[i] > high[i+2]
Swing Low:  low[i] < low[i-1] AND low[i] < low[i-2] AND low[i] < low[i+1] AND low[i] < low[i+2]

Note: Requires 2 bars of forward data for confirmation. This is acceptable
for labeling structure, not generating real-time signals.
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import SWING_LENGTH


def detect_swings(df: pd.DataFrame, swing_length: int = SWING_LENGTH) -> pd.DataFrame:
    """Detect swing highs and lows using 5-bar fractal pattern.

    Args:
        df: 15-min OHLCV DataFrame with timestamp, open, high, low, close
        swing_length: bars to look each side (default 2 → 5-bar fractal)

    Returns:
        DataFrame with columns: datetime, type, level, bar_index
    """
    high = df["high"].values
    low = df["low"].values
    timestamps = df["timestamp"].values

    records = []
    n = len(df)

    for i in range(swing_length, n - swing_length):
        # Check swing high
        is_swing_high = True
        for j in range(1, swing_length + 1):
            if high[i] <= high[i - j] or high[i] <= high[i + j]:
                is_swing_high = False
                break

        if is_swing_high:
            records.append({
                "datetime": timestamps[i],
                "type": "swing_high",
                "level": float(high[i]),
                "bar_index": i,
            })

        # Check swing low
        is_swing_low = True
        for j in range(1, swing_length + 1):
            if low[i] >= low[i - j] or low[i] >= low[i + j]:
                is_swing_low = False
                break

        if is_swing_low:
            records.append({
                "datetime": timestamps[i],
                "type": "swing_low",
                "level": float(low[i]),
                "bar_index": i,
            })

    return pd.DataFrame(records)


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min

    df = resample_to_15min(ingest_pair("EURUSD"))
    swings = detect_swings(df)

    print(f"Total swings: {len(swings):,}")
    print(f"Swing highs: {(swings['type'] == 'swing_high').sum():,}")
    print(f"Swing lows:  {(swings['type'] == 'swing_low').sum():,}")
    print(f"\nSample:\n{swings.head(10)}")
