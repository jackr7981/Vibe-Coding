"""
IS / Val / OOS Splitting — strict temporal separation.

Train:  2021-01-01 through 2022-12-31
Val:    2023-01-01 through 2023-12-31
OOS:    2024-01-01 onward

No refitting after OOS failure.
"""

import pandas as pd

from forexedge_ict_engine.config import (
    TRAIN_START, TRAIN_END, VAL_START, VAL_END, OOS_START,
)


def get_split(df: pd.DataFrame, date_col: str = "trading_date") -> dict:
    """Split DataFrame into train/val/oos based on trading_date.

    Returns dict: {"train": df, "val": df, "oos": df}
    """
    if date_col not in df.columns:
        raise ValueError(f"Column '{date_col}' not found. Available: {list(df.columns)}")

    dates = pd.to_datetime(df[date_col]).dt.date

    train_mask = (dates >= TRAIN_START) & (dates <= TRAIN_END)
    val_mask = (dates >= VAL_START) & (dates <= VAL_END)
    oos_mask = dates >= OOS_START

    splits = {
        "train": df[train_mask].copy(),
        "val": df[val_mask].copy(),
        "oos": df[oos_mask].copy(),
    }

    for name, split_df in splits.items():
        print(f"  {name}: {len(split_df):,} rows")

    return splits


def split_detections(detections: pd.DataFrame, datetime_col: str = "datetime") -> dict:
    """Split a detections DataFrame by the detection datetime."""
    dates = pd.to_datetime(detections[datetime_col]).dt.date

    return {
        "train": detections[(dates >= TRAIN_START) & (dates <= TRAIN_END)].copy(),
        "val": detections[(dates >= VAL_START) & (dates <= VAL_END)].copy(),
        "oos": detections[dates >= OOS_START].copy(),
    }


if __name__ == "__main__":
    from forexedge_ict_engine.pipeline.ingest import ingest_pair
    from forexedge_ict_engine.pipeline.resample import resample_to_15min

    df = resample_to_15min(ingest_pair("EURUSD"))
    print("\nSplitting 15-min data:")
    splits = get_split(df)
    for name, sdf in splits.items():
        dates = pd.to_datetime(sdf["trading_date"])
        print(f"  {name}: {dates.min().date()} to {dates.max().date()}")
