"""
Signal Generation — apply locked thresholds to produce dashboard-ready signals.

Suppression rule: If the engine cannot produce a prediction that exceeds
the relevant accuracy threshold, output "No Clear Edge" and suppress.
"""

import json
from datetime import datetime
from pathlib import Path

from forexedge_ict_engine.config import OUTPUT_DIR


def generate_fvg_signal(
    prediction: dict,
    fvg_row: dict,
    locked_threshold: int,
    pair: str = "EURUSD",
) -> dict | None:
    """Generate a dashboard-ready signal for an FVG instance.

    Returns None if signal should be suppressed (no clear edge).
    """
    n_positive = prediction["n_positive"]
    n_neighbors = prediction["n_neighbors"]

    if n_positive < locked_threshold:
        return None  # Suppressed — no clear edge

    # Determine signal type
    if n_positive == n_neighbors:
        signal_type = "FILL"
        probability = 1.0
    else:
        signal_type = "FILL"
        probability = prediction["probability"]

    # Expected time to fill (average of neighbor fill times would be ideal,
    # but we use a heuristic based on confidence)
    avg_dist = prediction["avg_distance"]
    if avg_dist < 0.08:
        confidence = "VERY_HIGH"
    elif avg_dist < 0.12:
        confidence = "HIGH"
    elif avg_dist < 0.15:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return {
        "pair": pair,
        "timestamp": str(fvg_row.get("datetime", "")),
        "pattern": "fvg",
        "signal_type": signal_type,
        "direction": fvg_row.get("type", ""),
        "session": fvg_row.get("session", ""),
        "gap_range": [fvg_row.get("gap_bottom"), fvg_row.get("gap_top")],
        "gap_pips": fvg_row.get("gap_pips"),
        "probability": round(probability, 4),
        "confidence": confidence,
        "neighbors_summary": f"{n_positive}/{n_neighbors} similar FVGs filled",
        "methodology": f"Gaussian-weighted {n_neighbors}-nearest-neighbor analog engine",
    }


def save_signals(signals: list, filename: str = "fvg_signals.json"):
    """Save dashboard-ready signals to JSON."""
    signals_dir = OUTPUT_DIR / "signals"
    signals_dir.mkdir(parents=True, exist_ok=True)

    path = signals_dir / filename
    with open(path, "w") as f:
        json.dump(signals, f, indent=2, default=str)

    print(f"Signals saved: {path} ({len(signals)} signals)")
    return path
