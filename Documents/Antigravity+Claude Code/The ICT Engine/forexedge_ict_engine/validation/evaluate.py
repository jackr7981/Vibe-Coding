"""
Blind OOS Evaluation — test locked thresholds on out-of-sample data.

OOS is touched exactly once. No refitting after failure.
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import MIN_SAMPLES_PUBLISH


def evaluate_fvg_oos(
    oos_predictions: list,
    oos_outcomes: pd.DataFrame,
    locked_threshold: int,
) -> dict:
    """Evaluate FVG fill signal on OOS data with locked threshold.

    Args:
        oos_predictions: list of prediction dicts from analog engine
        oos_outcomes: DataFrame with outcome columns aligned with predictions
        locked_threshold: the n_positive threshold locked from calibration

    Returns:
        Validation report dict.
    """
    df = pd.DataFrame(oos_predictions)
    df["actual_filled"] = oos_outcomes["filled"].values.astype(float)
    df["actual_touched"] = oos_outcomes["touched"].values.astype(float)
    df["actual_held"] = oos_outcomes["held"].values.astype(float)
    df["session"] = oos_outcomes["session"].values
    df["datetime"] = oos_outcomes["datetime"].values
    df["type"] = oos_outcomes["type"].values

    # Apply locked threshold
    signal_mask = df["n_positive"] >= locked_threshold
    signals = df[signal_mask]
    no_signals = df[~signal_mask]

    total_count = len(df)
    signal_count = len(signals)
    fire_rate = signal_count / total_count if total_count > 0 else 0

    # Overall accuracy
    accuracy = float(signals["actual_filled"].mean()) if signal_count > 0 else 0.0

    # Year-over-year breakdown
    signals["year"] = pd.to_datetime(signals["datetime"]).dt.year
    by_year = {}
    for year, grp in signals.groupby("year"):
        if len(grp) >= 10:  # Minimum for year breakdown
            by_year[str(year)] = {
                "accuracy": round(float(grp["actual_filled"].mean()), 4),
                "count": len(grp),
            }

    # Session breakdown
    by_session = {}
    for session, grp in signals.groupby("session"):
        if len(grp) >= 10:
            by_session[session] = {
                "accuracy": round(float(grp["actual_filled"].mean()), 4),
                "count": len(grp),
            }

    # Confidence level breakdown
    by_confidence = {}
    for conf, grp in signals.groupby("confidence_level"):
        if len(grp) >= 5:
            by_confidence[conf] = {
                "accuracy": round(float(grp["actual_filled"].mean()), 4),
                "count": len(grp),
            }

    # Year-over-year stability check
    year_accuracies = [v["accuracy"] for v in by_year.values() if v["count"] >= MIN_SAMPLES_PUBLISH]
    stability = "STABLE" if year_accuracies and (max(year_accuracies) - min(year_accuracies)) <= 0.10 else "UNSTABLE"

    # PASS/FAIL determination
    passed = (
        accuracy >= 0.90 and
        signal_count >= MIN_SAMPLES_PUBLISH and
        stability == "STABLE"
    )

    return {
        "concept": "fvg_fill",
        "status": "PASS" if passed else "FAIL",
        "threshold": f"n_positive >= {locked_threshold}",
        "oos_accuracy": round(accuracy, 4),
        "oos_signal_count": signal_count,
        "oos_total_instances": total_count,
        "fire_rate": round(fire_rate, 4),
        "year_over_year": by_year,
        "by_session": by_session,
        "by_confidence": by_confidence,
        "stability": stability,
        "passed": passed,
    }


def evaluate_directional_oos(
    oos_predictions: list,
    oos_outcomes: pd.DataFrame,
    locked_threshold: float,
    concept_name: str,
    rr_col: str = "positive_rr",
) -> dict:
    """Evaluate directional signal on OOS data."""
    df = pd.DataFrame(oos_predictions)
    df["actual_rr"] = oos_outcomes[rr_col].values.astype(float)
    df["session"] = oos_outcomes["session"].values
    df["datetime"] = oos_outcomes["datetime"].values

    signal_mask = df["probability"] >= locked_threshold
    signals = df[signal_mask]
    signal_count = len(signals)
    total_count = len(df)

    rr_rate = float(signals["actual_rr"].mean()) if signal_count > 0 else 0.0

    passed = (
        rr_rate >= 0.55 and
        signal_count >= MIN_SAMPLES_PUBLISH
    )

    return {
        "concept": concept_name,
        "status": "PASS" if passed else "FAIL",
        "threshold": f"probability >= {locked_threshold:.2f}",
        "oos_positive_rr": round(rr_rate, 4),
        "oos_signal_count": signal_count,
        "oos_total_instances": total_count,
        "fire_rate": round(signal_count / total_count, 4) if total_count > 0 else 0,
        "passed": passed,
    }
