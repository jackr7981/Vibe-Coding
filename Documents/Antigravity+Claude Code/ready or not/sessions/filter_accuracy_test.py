#!/usr/bin/env python3
"""Walk-Forward Accuracy Test — No Look-Ahead Bias.

Pipeline (simulates real-time):
  1. Discover filter combos from TRAINING data only (≤ 2024-06-30)
  2. For each test session where a combo fires:
     a. Find all TRAIN sessions matching the same combo
     b. Among those, find the N closest by vector distance
     c. Weight outcomes by inverse distance → forecast
  3. Compare forecast vs actual next-session outcome

Split:
  Train: 2021-02-02 to 2024-06-30 (~3.5 years)
  Test:  2024-07-01 to 2026-02-27 (~1.7 years, fully out-of-sample)
"""

import sys
import json
import itertools
from datetime import date
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "The Engine"))

from src.engine.vector_store import VectorStoreManager
from src.engine.similarity import batch_distances


# ═══════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════

TRAIN_END = date(2024, 6, 30)
PIP_MULT = 10000
TOP_N_NEIGHBORS = 30  # Number of closest vector matches to use for forecast

# Known categorical filters
CATEGORICAL = {
    "orb_direction", "post_orb_first_break", "post_orb_fakeout",
    "post_ib_break_direction", "gap_filled_bool",
    "prior_day_type", "session_type",
    "vwap_open_position", "vwap_close_position",
    "volatility_trend", "intraday_vol_shape",
    "tpo_distribution_shape", "trend_alignment",
    "prior_high_reaction", "prior_low_reaction", "prior_close_reaction",
    "prior_poc_reaction", "prior_va_high_reaction",
    "sweep_then_reverse", "round_number_tested",
    "session_continuation", "ib_break_retest", "ib_break_retest_held",
    "is_month_end", "is_month_start", "prior_ib_break_direction",
}

EXCLUDE = {
    "date", "session_name", "pair", "bar_count", "atr",
    "session_ohlc_open", "session_ohlc_high", "session_ohlc_low", "session_ohlc_close",
    "orb_high", "orb_low", "ib_high", "ib_low",
    "next_direction", "next_change_pips", "next_abs_change",
    "next_range_pips", "vector",
}


# ═══════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════


def load_sessions(data_dir):
    """Load all sessions with metadata, outcomes, and vectors."""
    mgr = VectorStoreManager(data_dir)
    mgr.load_all()

    sessions = []
    main = ["london", "new_york", "tokyo", "sydney"]

    for sname in main:
        store = mgr[sname]
        for i in range(len(store)):
            meta = store._metadata[i]
            outcome = store._outcomes[i]

            if not outcome or not outcome.get("direction"):
                continue

            next_open = outcome.get("open", 0)
            next_close = outcome.get("close", 0)
            next_high = outcome.get("high", 0)
            next_low = outcome.get("low", 0)

            if not next_open or not next_close:
                continue

            sessions.append({
                "date": store._dates[i],
                "session_name": sname,
                "pair": store._pairs[i],
                "vector": store._vectors[i],
                "metadata": meta,
                "next_direction": outcome.get("direction", 0),
                "next_change_pips": (next_close - next_open) * PIP_MULT,
                "next_abs_change": abs(next_close - next_open) * PIP_MULT,
                "next_range_pips": (next_high - next_low) * PIP_MULT if next_high and next_low else 0,
            })

    return sessions


# ═══════════════════════════════════════════════════════════════════════
# PHASE 1: DISCOVER COMBOS FROM TRAINING DATA ONLY
# ═══════════════════════════════════════════════════════════════════════


def discretize_numeric(values, n_bins=3):
    """Discretize numeric values into terciles. Returns labels and boundaries."""
    arr = np.array([v for v in values if v is not None and isinstance(v, (int, float))])
    if len(arr) < 30:
        return None, None
    boundaries = [np.percentile(arr, 100 * i / n_bins) for i in range(1, n_bins)]
    return boundaries


def get_bin_label(value, boundaries):
    """Get bin label for a value given boundaries."""
    if value is None or not isinstance(value, (int, float)):
        return None
    for i, b in enumerate(boundaries):
        if value < b:
            return ["low", "mid", "high"][min(i, 2)]
    return "high"


def rank_single_filters_train(train_sessions):
    """Rank individual filters by predictive power using ONLY training data."""
    print("\n  Ranking individual filters (training data only)...")

    # Build a mini DataFrame from training sessions
    rows = []
    for s in train_sessions:
        row = {"next_abs": s["next_abs_change"], "session_name": s["session_name"]}
        for k, v in s["metadata"].items():
            if k not in EXCLUDE and not isinstance(v, dict):
                row[k] = v
        rows.append(row)

    df = pd.DataFrame(rows)
    base_p90 = df["next_abs"].quantile(0.90)
    _ = df["next_abs"] >= max(base_p90 * 0.5, 20)  # threshold reference

    results = []
    for col in df.columns:
        if col in ("next_abs", "session_name") or col in EXCLUDE:
            continue
        if df[col].nunique() < 2:
            continue

        valid = df[[col, "next_abs"]].dropna()
        if len(valid) < 100:
            continue

        if col in CATEGORICAL or valid[col].dtype == object or valid[col].dtype == bool:
            # Categorical: compute spread across categories
            groups = valid.groupby(col)["next_abs"].agg(["mean", "count"])
            groups = groups[groups["count"] >= 20]
            if len(groups) < 2:
                continue
            spread = groups["mean"].max() - groups["mean"].min()
            results.append({"filter": col, "spread": spread, "type": "categorical"})
        else:
            # Numeric: compute spread across terciles
            try:
                valid["q"] = pd.qcut(valid[col], 3, labels=["low", "mid", "high"], duplicates="drop")
            except ValueError:
                continue
            groups = valid.groupby("q")["next_abs"].agg(["mean", "count"])
            if len(groups) < 2:
                continue
            spread = groups["mean"].max() - groups["mean"].min()
            results.append({"filter": col, "spread": spread, "type": "numeric"})

    results.sort(key=lambda x: x["spread"], reverse=True)
    return results


def discover_combos_from_train(train_sessions, top_n_filters=15):
    """Discover the best filter combinations using ONLY training data.

    This mirrors the logic from filter_research.py but restricted to train data.
    Returns a list of combo definitions ready for testing.
    """
    print("\n" + "=" * 80)
    print("PHASE 1: COMBO DISCOVERY (TRAINING DATA ONLY)")
    print(f"  Training sessions: {len(train_sessions)}")
    print(f"  Date range: {train_sessions[0]['date']} to {train_sessions[-1]['date']}")
    print("=" * 80)

    # Rank individual filters
    rankings = rank_single_filters_train(train_sessions)
    top_filters = [r["filter"] for r in rankings[:top_n_filters]]
    print(f"\n  Top {len(top_filters)} filters (by spread on training data):")
    for i, r in enumerate(rankings[:top_n_filters]):
        print(f"    {i+1:>2}. {r['filter']:<45} spread={r['spread']:.1f} pips  ({r['type']})")

    # Build mini-DataFrame from train for combo evaluation
    rows = []
    for s in train_sessions:
        row = {"next_abs": s["next_abs_change"], "session_name": s["session_name"]}
        for k, v in s["metadata"].items():
            if not isinstance(v, dict):
                row[k] = v
        rows.append(row)
    train_df = pd.DataFrame(rows)

    # Compute tercile boundaries from training data (for later use in test matching)
    tercile_boundaries = {}
    for filt in top_filters:
        if filt in CATEGORICAL or filt == "session_name":
            continue
        col = train_df[filt].dropna()
        if len(col) >= 30:
            tercile_boundaries[filt] = [float(col.quantile(1/3)), float(col.quantile(2/3))]

    # Test pairs and triples
    print(f"\n  Testing pairs from top {min(12, len(top_filters))} filters...")
    all_combo_results = []

    for f1, f2 in itertools.combinations(top_filters[:12], 2):
        result = _evaluate_combo_train(train_df, [f1, f2])
        if result and result["spread"] > 3:
            all_combo_results.append(result)

    print(f"  Found {len(all_combo_results)} significant pairs")

    print(f"  Testing triples from top {min(10, len(top_filters))} filters...")
    n_triples_before = len(all_combo_results)
    for f1, f2, f3 in itertools.combinations(top_filters[:10], 3):
        result = _evaluate_combo_train(train_df, [f1, f2, f3])
        if result and result["spread"] > 5:
            all_combo_results.append(result)

    print(f"  Found {len(all_combo_results) - n_triples_before} significant triples")

    # Sort by spread (predictive power)
    all_combo_results.sort(key=lambda x: x["spread"], reverse=True)

    # Select top combos for testing: diverse set across sizes and types
    selected_combos = _select_diverse_combos(all_combo_results, max_combos=15)

    print(f"\n  Selected {len(selected_combos)} combos for out-of-sample testing:")
    for i, c in enumerate(selected_combos):
        print(f"    {i+1:>2}. [{c['best_group']}] "
              f"mean={c['best_mean']:.1f}p  n={c['best_count']}  "
              f"spread={c['spread']:.1f}p  filters={c['filters']}")

    return selected_combos, tercile_boundaries


def _evaluate_combo_train(df, filters):
    """Evaluate a filter combination on training data."""
    valid = df.dropna(subset=list(filters) + ["next_abs"])
    if len(valid) < 50:
        return None

    disc_cols = []
    for f in filters:
        if f in CATEGORICAL or valid[f].dtype == object or valid[f].dtype == bool:
            disc_cols.append(valid[f].astype(str))
        else:
            try:
                disc_cols.append(pd.qcut(valid[f], 3, labels=["low", "mid", "high"], duplicates="drop"))
            except (ValueError, TypeError):
                return None

    combo_key = pd.Series(
        ["_".join(str(x) for x in row) for row in zip(*disc_cols)],
        index=valid.index
    )

    grouped = valid.groupby(combo_key)["next_abs"].agg(["mean", "count", "std"])
    grouped = grouped[grouped["count"] >= 10]
    if len(grouped) < 2:
        return None

    best_group = grouped["mean"].idxmax()
    worst_group = grouped["mean"].idxmin()

    return {
        "filters": list(filters),
        "best_group": best_group,
        "best_mean": float(grouped.loc[best_group, "mean"]),
        "best_count": int(grouped.loc[best_group, "count"]),
        "worst_mean": float(grouped.loc[worst_group, "mean"]),
        "spread": float(grouped.loc[best_group, "mean"] - grouped.loc[worst_group, "mean"]),
    }


def _select_diverse_combos(all_results, max_combos=15):
    """Select a diverse set of combos — different sizes, different filter sets."""
    selected = []
    used_filter_sets = set()

    for result in all_results:
        key = frozenset(result["filters"])
        if key in used_filter_sets:
            continue

        # Skip combos where the best group has very few sessions (unreliable)
        if result["best_count"] < 15:
            continue

        used_filter_sets.add(key)
        selected.append(result)

        if len(selected) >= max_combos:
            break

    # If we didn't get enough high-count combos, relax the threshold
    if len(selected) < 8:
        for result in all_results:
            key = frozenset(result["filters"])
            if key in used_filter_sets:
                continue
            if result["best_count"] < 10:
                continue
            used_filter_sets.add(key)
            selected.append(result)
            if len(selected) >= max_combos:
                break

    return selected


# ═══════════════════════════════════════════════════════════════════════
# MATCHING & FORECASTING
# ═══════════════════════════════════════════════════════════════════════


def session_matches_group(session, filters, group_label, tercile_boundaries):
    """Check if a session matches a specific filter group (e.g., 'high_expanding_london')."""
    parts = group_label.split("_")
    meta = session["metadata"]

    # Handle compound labels: some filter values contain underscores
    # We need to match parts to filters intelligently
    part_idx = 0
    for filt in filters:
        if part_idx >= len(parts):
            return False

        if filt in CATEGORICAL or filt == "session_name":
            # Categorical: could be multi-word. Try progressively longer matches.
            actual_val = str(meta.get(filt, session.get(filt, "")))
            # Try matching 1, 2, or 3 parts
            matched = False
            for length in range(1, min(4, len(parts) - part_idx + 1)):
                candidate = "_".join(parts[part_idx:part_idx + length])
                if candidate == actual_val:
                    part_idx += length
                    matched = True
                    break
            if not matched:
                return False
        else:
            # Numeric: tercile label (low/mid/high)
            target_label = parts[part_idx]
            if target_label not in ("low", "mid", "high"):
                return False

            val = meta.get(filt)
            if val is None or not isinstance(val, (int, float)):
                return False

            bounds = tercile_boundaries.get(filt)
            if bounds is None:
                return False

            t_lo, t_hi = bounds
            if target_label == "low" and val >= t_lo:
                return False
            elif target_label == "mid" and (val < t_lo or val >= t_hi):
                return False
            elif target_label == "high" and val < t_hi:
                return False

            part_idx += 1

    return part_idx == len(parts)


def forecast_from_neighbors(test_session, matching_train_sessions, top_n=TOP_N_NEIGHBORS):
    """Find N closest vector matches among matching train sessions and forecast.

    Returns forecast dict or None if insufficient matches.
    """
    if len(matching_train_sessions) < 3:
        return None

    query_vec = test_session["vector"]
    train_vectors = np.array([s["vector"] for s in matching_train_sessions])
    distances = batch_distances(query_vec, train_vectors, metric="euclidean")

    # Get top-N closest
    n = min(top_n, len(distances))
    top_idx = np.argsort(distances)[:n]

    # Distance-weighted forecast
    top_distances = distances[top_idx]
    # Inverse-distance weighting (with small epsilon to avoid division by zero)
    weights = 1.0 / (top_distances + 1e-8)
    weights /= weights.sum()

    changes = np.array([matching_train_sessions[i]["next_change_pips"] for i in top_idx])
    abs_changes = np.array([matching_train_sessions[i]["next_abs_change"] for i in top_idx])

    # Weighted forecast
    weighted_change = np.sum(weights * changes)
    weighted_abs = np.sum(weights * abs_changes)

    # Simple majority direction
    bull_count = np.sum(changes > 0)
    bull_pct = bull_count / n * 100

    # Direction score: weighted
    direction_score = np.sum(weights * np.sign(changes))

    # Confidence components
    mean_distance = float(np.mean(top_distances))
    distance_quality = 1.0 / (1.0 + mean_distance)  # Sigmoid-like
    agreement = max(bull_pct, 100 - bull_pct) / 100  # How much matches agree
    sample_factor = min(1.0, np.log(n + 1) / np.log(51))  # Saturates at ~50
    magnitude_cv = float(np.std(abs_changes) / max(np.mean(abs_changes), 0.1))
    magnitude_consistency = 1.0 / (1.0 + magnitude_cv)

    confidence = (
        0.35 * distance_quality +
        0.35 * agreement +
        0.15 * sample_factor +
        0.15 * magnitude_consistency
    )

    return {
        "predicted_change": float(weighted_change),
        "predicted_abs": float(weighted_abs),
        "predicted_direction": 1 if direction_score > 0.1 else (-1 if direction_score < -0.1 else 0),
        "direction_score": float(direction_score),
        "bull_pct": float(bull_pct),
        "confidence": float(confidence),
        "mean_distance": mean_distance,
        "n_matches": n,
        "n_pool": len(matching_train_sessions),
        # Unweighted stats
        "simple_mean_change": float(np.mean(changes)),
        "simple_mean_abs": float(np.mean(abs_changes)),
        "simple_median_abs": float(np.median(abs_changes)),
    }


# ═══════════════════════════════════════════════════════════════════════
# WALK-FORWARD TEST
# ═══════════════════════════════════════════════════════════════════════


def walk_forward_test(train_sessions, test_sessions, combo, tercile_boundaries):
    """Walk-forward: when combo fires in test → search train history → forecast."""
    filters = combo["filters"]
    target_group = combo["best_group"]

    # Pre-filter: find all train sessions in this combo's best group
    train_matches = [
        s for s in train_sessions
        if session_matches_group(s, filters, target_group, tercile_boundaries)
    ]

    # Find test sessions that match the same group
    test_matches = [
        s for s in test_sessions
        if session_matches_group(s, filters, target_group, tercile_boundaries)
    ]

    if not train_matches or not test_matches:
        return None

    # For each matching test session, forecast from nearest train neighbors
    predictions = []
    for test_s in test_matches:
        forecast = forecast_from_neighbors(test_s, train_matches)
        if forecast is None:
            continue

        actual_change = test_s["next_change_pips"]
        actual_abs = test_s["next_abs_change"]
        actual_dir = 1 if actual_change > 0 else -1

        predictions.append({
            "date": test_s["date"],
            "session": test_s["session_name"],
            "forecast": forecast,
            "actual_change": actual_change,
            "actual_abs": actual_abs,
            "actual_dir": actual_dir,
        })

    if not predictions:
        return None

    return _compute_accuracy_metrics(combo, train_matches, test_matches, predictions)


def _compute_accuracy_metrics(combo, train_matches, test_matches, predictions):
    """Compute comprehensive accuracy metrics from predictions."""
    n = len(predictions)

    # Direction accuracy
    dir_correct = 0
    dir_total = 0
    for p in predictions:
        pred_dir = p["forecast"]["predicted_direction"]
        if pred_dir != 0:  # Only count when we make a directional call
            dir_total += 1
            if pred_dir == p["actual_dir"]:
                dir_correct += 1
    dir_accuracy = dir_correct / max(dir_total, 1) * 100

    # Magnitude accuracy
    actual_abs_list = [p["actual_abs"] for p in predictions]
    predicted_abs_list = [p["forecast"]["predicted_abs"] for p in predictions]
    mag_errors = [abs(a - p) for a, p in zip(actual_abs_list, predicted_abs_list)]

    # Hit rates at various thresholds
    hit_rates = {}
    for threshold in [15, 20, 25, 30, 40, 50]:
        hits = sum(1 for a in actual_abs_list if a >= threshold)
        rate = hits / n * 100
        hit_rates[threshold] = {"hits": hits, "total": n, "rate": round(rate, 1)}

    # Move distribution
    actual_abs_arr = np.array(actual_abs_list)

    # Forecast improvement over naive (predict 0)
    actual_changes = [p["actual_change"] for p in predictions]
    forecast_errors = [abs(p["actual_change"] - p["forecast"]["predicted_change"]) for p in predictions]
    naive_errors = [abs(c) for c in actual_changes]
    forecast_mae = np.mean(forecast_errors)
    naive_mae = np.mean(naive_errors)
    improvement = (1 - forecast_mae / max(naive_mae, 0.01)) * 100

    # Profit simulation: trade in predicted direction
    pnl_pips = []
    for p in predictions:
        pred_dir = p["forecast"]["predicted_direction"]
        if pred_dir != 0:
            pnl_pips.append(pred_dir * p["actual_change"])

    total_pnl = sum(pnl_pips) if pnl_pips else 0
    win_trades = sum(1 for p in pnl_pips if p > 0)
    win_rate = win_trades / max(len(pnl_pips), 1) * 100
    avg_win = np.mean([p for p in pnl_pips if p > 0]) if win_trades > 0 else 0
    avg_loss = np.mean([abs(p) for p in pnl_pips if p <= 0]) if (len(pnl_pips) - win_trades) > 0 else 0
    risk_reward = avg_win / max(avg_loss, 0.01)

    # Confidence-filtered accuracy (only high-confidence predictions)
    high_conf_preds = [p for p in predictions if p["forecast"]["confidence"] >= 0.5]
    if high_conf_preds:
        hc_dir_correct = sum(
            1 for p in high_conf_preds
            if p["forecast"]["predicted_direction"] != 0
            and p["forecast"]["predicted_direction"] == p["actual_dir"]
        )
        hc_dir_total = sum(1 for p in high_conf_preds if p["forecast"]["predicted_direction"] != 0)
        hc_accuracy = hc_dir_correct / max(hc_dir_total, 1) * 100
    else:
        hc_accuracy = 0

    # Mean confidence
    mean_conf = np.mean([p["forecast"]["confidence"] for p in predictions])

    return {
        "combo_filters": combo["filters"],
        "combo_group": combo["best_group"],
        "combo_train_mean": round(combo["best_mean"], 1),
        "combo_spread": round(combo["spread"], 1),
        "train_pool": len(train_matches),
        "test_triggers": len(test_matches),
        "predictions_made": n,
        # Direction
        "direction_accuracy": round(dir_accuracy, 1),
        "direction_calls": dir_total,
        "high_conf_accuracy": round(hc_accuracy, 1),
        "high_conf_count": len(high_conf_preds),
        "mean_confidence": round(float(mean_conf), 3),
        # Magnitude
        "actual_mean_abs": round(float(np.mean(actual_abs_list)), 1),
        "actual_median_abs": round(float(np.median(actual_abs_list)), 1),
        "predicted_mean_abs": round(float(np.mean(predicted_abs_list)), 1),
        "magnitude_mae": round(float(np.mean(mag_errors)), 1),
        # Distribution
        "actual_p25": round(float(np.percentile(actual_abs_arr, 25)), 1),
        "actual_p50": round(float(np.percentile(actual_abs_arr, 50)), 1),
        "actual_p75": round(float(np.percentile(actual_abs_arr, 75)), 1),
        "actual_p90": round(float(np.percentile(actual_abs_arr, 90)), 1),
        # Hit rates
        "hit_rates": hit_rates,
        # Forecast quality
        "forecast_mae": round(float(forecast_mae), 1),
        "naive_mae": round(float(naive_mae), 1),
        "forecast_improvement_pct": round(float(improvement), 1),
        # Profit
        "total_pnl_pips": round(float(total_pnl), 1),
        "win_rate": round(float(win_rate), 1),
        "avg_win": round(float(avg_win), 1),
        "avg_loss": round(float(avg_loss), 1),
        "risk_reward": round(float(risk_reward), 2),
        "trades": len(pnl_pips),
    }


# ═══════════════════════════════════════════════════════════════════════
# BASELINE
# ═══════════════════════════════════════════════════════════════════════


def compute_baseline(test_sessions):
    """Compute baseline stats for the full test period (no filter)."""
    abs_changes = [s["next_abs_change"] for s in test_sessions]

    base_rates = {}
    for threshold in [15, 20, 25, 30, 40, 50]:
        hits = sum(1 for a in abs_changes if a >= threshold)
        base_rates[threshold] = round(hits / len(abs_changes) * 100, 1)

    return {
        "total_test_sessions": len(test_sessions),
        "mean_abs_pips": round(float(np.mean(abs_changes)), 1),
        "median_abs_pips": round(float(np.median(abs_changes)), 1),
        "p75_pips": round(float(np.percentile(abs_changes, 75)), 1),
        "p90_pips": round(float(np.percentile(abs_changes, 90)), 1),
        "base_rates": base_rates,
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════


def main():
    print("=" * 80)
    print("WALK-FORWARD ACCURACY TEST (NO LOOK-AHEAD BIAS)")
    print("Combos discovered from training data only")
    print("Forecast via N-nearest vector neighbors within matching train sessions")
    print("Train: 2021-02-02 → 2024-06-30  |  Test: 2024-07-01 → 2026-02-27")
    print("=" * 80)

    data_dir = str(Path(__file__).parent.parent / "The Engine" / "data" / "vectors")
    sessions = load_sessions(data_dir)
    print(f"\nLoaded {len(sessions)} sessions total")

    # Split — strict temporal
    train = [s for s in sessions if s["date"] <= TRAIN_END]
    test = [s for s in sessions if s["date"] > TRAIN_END]
    train.sort(key=lambda s: s["date"])
    test.sort(key=lambda s: s["date"])

    print(f"  Train: {len(train)} sessions ({train[0]['date']} to {train[-1]['date']})")
    print(f"  Test:  {len(test)} sessions ({test[0]['date']} to {test[-1]['date']})")

    # Phase 1: Discover combos from training data ONLY
    combos, tercile_boundaries = discover_combos_from_train(train)

    # Baseline
    baseline = compute_baseline(test)
    print(f"\n── BASELINE (all test sessions, no filters) ──")
    print(f"  Sessions:    {baseline['total_test_sessions']}")
    print(f"  Mean move:   {baseline['mean_abs_pips']} pips")
    print(f"  Median move: {baseline['median_abs_pips']} pips")
    print(f"  P90 move:    {baseline['p90_pips']} pips")
    print(f"  Base rates:  ", end="")
    for thresh, rate in baseline["base_rates"].items():
        print(f"{thresh}p={rate}%  ", end="")
    print()

    # Phase 2: Walk-forward test each combo
    print(f"\n{'=' * 80}")
    print("PHASE 2: WALK-FORWARD TESTING (OUT-OF-SAMPLE)")
    print("=" * 80)

    all_results = []
    for i, combo in enumerate(combos):
        print(f"\n  Testing combo {i+1}/{len(combos)}: {combo['filters']} → [{combo['best_group']}]")
        result = walk_forward_test(train, test, combo, tercile_boundaries)
        if result is None:
            print(f"    SKIPPED (no matches in test period)")
            continue

        all_results.append(result)
        print(f"    Train pool: {result['train_pool']} | Test triggers: {result['test_triggers']} | "
              f"Predictions: {result['predictions_made']}")
        print(f"    Direction accuracy: {result['direction_accuracy']}% "
              f"(high-conf: {result['high_conf_accuracy']}%, n={result['high_conf_count']})")
        print(f"    Actual mean: {result['actual_mean_abs']}p | Predicted: {result['predicted_mean_abs']}p | "
              f"MAE: {result['magnitude_mae']}p")
        print(f"    P&L: {result['total_pnl_pips']:+.1f} pips | Win rate: {result['win_rate']}% | "
              f"R:R: {result['risk_reward']}")

    if not all_results:
        print("\nNo combos produced testable results.")
        return

    # Sort by direction accuracy
    all_results.sort(key=lambda r: r["direction_accuracy"], reverse=True)

    # ── SUMMARY TABLE ──
    print(f"\n\n{'=' * 80}")
    print("SUMMARY SCORECARD")
    print("=" * 80)

    print(f"\n  {'#':>2} {'Group':<50} {'Pool':>4} {'Test':>4} {'Dir%':>5} "
          f"{'HiCf%':>5} {'MeanP':>6} {'PredP':>6} {'MAE':>5} "
          f"{'P&L':>7} {'WR%':>5} {'R:R':>5}")
    print("  " + "─" * 120)

    for i, r in enumerate(all_results):
        print(f"  {i+1:>2} {r['combo_group']:<50} "
              f"{r['train_pool']:>4} {r['predictions_made']:>4} "
              f"{r['direction_accuracy']:>5.1f} {r['high_conf_accuracy']:>5.1f} "
              f"{r['actual_mean_abs']:>6.1f} {r['predicted_mean_abs']:>6.1f} "
              f"{r['magnitude_mae']:>5.1f} "
              f"{r['total_pnl_pips']:>+7.1f} {r['win_rate']:>5.1f} "
              f"{r['risk_reward']:>5.2f}")

    print(f"\n  BASELINE (no filter): {baseline['total_test_sessions']} sessions | "
          f"mean={baseline['mean_abs_pips']}p | median={baseline['median_abs_pips']}p")

    # Hit rate comparison
    print(f"\n\n{'=' * 80}")
    print("HIT RATE LIFT vs BASELINE")
    print("=" * 80)

    for r in all_results:
        print(f"\n  [{r['combo_group']}] (n={r['predictions_made']})")
        for thresh in [20, 25, 30, 40, 50]:
            hr = r["hit_rates"].get(thresh, {})
            base = baseline["base_rates"].get(thresh, 0)
            if hr and hr["rate"] > 0:
                lift = hr["rate"] / max(base, 0.1)
                bar = "█" * int(hr["rate"] / 3)
                print(f"    {thresh:>3}+ pips: {hr['rate']:5.1f}% (base={base}%, lift={lift:.1f}x) {bar}")

    # Confidence calibration
    print(f"\n\n{'=' * 80}")
    print("CONFIDENCE CALIBRATION")
    print("=" * 80)

    for r in all_results:
        # We need to re-run to get individual predictions... use a summary instead
        print(f"\n  [{r['combo_group']}]")
        print(f"    Mean confidence: {r['mean_confidence']:.3f}")
        print(f"    Overall dir accuracy: {r['direction_accuracy']}%")
        print(f"    High-confidence (≥0.5) dir accuracy: {r['high_conf_accuracy']}% "
              f"({r['high_conf_count']} predictions)")

    # Save results
    output = {
        "config": {
            "train_end": str(TRAIN_END),
            "top_n_neighbors": TOP_N_NEIGHBORS,
            "combos_discovered_from": "training_data_only",
        },
        "baseline": baseline,
        "tercile_boundaries": tercile_boundaries,
        "results": all_results,
    }
    output_path = Path(__file__).parent / "filter_accuracy_results.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
