"""
Threshold Calibration — discover signal thresholds on train+val data.

Protocol:
1. Discover candidate thresholds on TRAIN (2021-2022)
2. Validate on VAL (2023) — pick best-performing thresholds
3. LOCK thresholds — no further changes
4. Test on OOS (2024+) — report honestly
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path

from forexedge_ict_engine.config import MIN_SAMPLES_PUBLISH, MIN_SAMPLES_DISCARD


def calibrate_fvg_thresholds(
    train_predictions: list,
    train_outcomes: pd.DataFrame,
    val_predictions: list,
    val_outcomes: pd.DataFrame,
) -> dict:
    """Discover FVG fill signal thresholds on train, validate on val.

    Tests various n_positive thresholds (out of N neighbors) to find
    the best fill-prediction threshold.

    Returns:
        Dict with locked thresholds and their val performance.
    """
    # Merge predictions with outcomes
    train_df = _merge_preds_outcomes(train_predictions, train_outcomes, "filled")
    val_df = _merge_preds_outcomes(val_predictions, val_outcomes, "filled")

    results = {}

    # Test fill signal: n_positive >= threshold → predict "will fill"
    for threshold in range(10, 21):
        # Train performance
        train_mask = train_df["n_positive"] >= threshold
        train_signals = train_df[train_mask]
        if len(train_signals) < MIN_SAMPLES_DISCARD:
            continue

        train_acc = train_signals["actual"].mean()
        train_fire_rate = len(train_signals) / len(train_df)

        # Val performance
        val_mask = val_df["n_positive"] >= threshold
        val_signals = val_df[val_mask]
        if len(val_signals) < MIN_SAMPLES_DISCARD:
            continue

        val_acc = val_signals["actual"].mean()
        val_fire_rate = len(val_signals) / len(val_df)

        results[f"n_positive>={threshold}"] = {
            "threshold": threshold,
            "train_accuracy": round(float(train_acc), 4),
            "train_signals": len(train_signals),
            "train_fire_rate": round(float(train_fire_rate), 4),
            "val_accuracy": round(float(val_acc), 4),
            "val_signals": len(val_signals),
            "val_fire_rate": round(float(val_fire_rate), 4),
        }

    if not results:
        return {"best_threshold": None, "all_thresholds": {}}

    # Pick threshold with best val accuracy (min fire rate 2%)
    valid = {k: v for k, v in results.items() if v["val_fire_rate"] >= 0.02}
    if not valid:
        valid = results

    best_key = max(valid, key=lambda k: valid[k]["val_accuracy"])
    best = valid[best_key]

    return {
        "best_threshold": best["threshold"],
        "best_val_accuracy": best["val_accuracy"],
        "best_val_fire_rate": best["val_fire_rate"],
        "best_train_accuracy": best["train_accuracy"],
        "all_thresholds": results,
    }


def calibrate_directional_thresholds(
    predictions: list,
    outcomes: pd.DataFrame,
    direction_col: str,
    rr_col: str = "positive_rr",
) -> dict:
    """Discover thresholds for directional signals (sweeps, BOS).

    Target: positive_rr > 55% on filtered subset.
    """
    df = pd.DataFrame(predictions)
    df["actual_rr"] = outcomes[rr_col].values

    results = {}
    for prob_threshold in np.arange(0.55, 0.95, 0.05):
        mask = df["probability"] >= prob_threshold
        signals = df[mask]
        if len(signals) < MIN_SAMPLES_DISCARD:
            continue

        rr_rate = signals["actual_rr"].mean()
        results[f"prob>={prob_threshold:.2f}"] = {
            "probability_threshold": round(float(prob_threshold), 2),
            "positive_rr_rate": round(float(rr_rate), 4),
            "signal_count": len(signals),
            "fire_rate": round(float(len(signals) / len(df)), 4),
        }

    return results


def _merge_preds_outcomes(predictions: list, outcomes: pd.DataFrame, outcome_col: str) -> pd.DataFrame:
    """Merge prediction results with actual outcomes."""
    df = pd.DataFrame(predictions)
    df["actual"] = outcomes[outcome_col].values.astype(float)
    return df
