#!/usr/bin/env python3
"""24-Hour Filter Analysis Pipeline — No Session Boundaries.

Combined pipeline:
  Phase 1: Load 24h snapshots → flat DataFrame
  Phase 2: Rank individual filters by predictive power (training only)
  Phase 3: Discover best filter combos (training only)
  Phase 4: Walk-forward accuracy test with vector search (out-of-sample)
  Phase 5: Stress test (permutation, random baseline, temporal stability,
           bootstrap CI, naive baselines, vector value-add)

Split:
  Train: ≤ 2024-06-30 (~3.5 years)
  Test:  > 2024-06-30 (~1.7 years, fully out-of-sample)

Focus: predicting directional moves in the next 1h/2h/4h horizons,
       especially 15+ pip swings.

Usage:
    python "ready or not/24 hours/run_24h_analysis.py"
"""

import sys
import json
import itertools
import warnings
from datetime import date
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)

ENGINE_ROOT = Path(__file__).resolve().parent.parent.parent / "The Engine"
sys.path.insert(0, str(ENGINE_ROOT))

from src.engine.similarity import batch_distances

np.random.seed(42)

# ═══════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════

TRAIN_END = date(2024, 6, 30)
PIP_MULT = 10000
TOP_N_NEIGHBORS = 30
VECTOR_DIMS = 119

# Primary outcome horizon for accuracy testing
# (we test 1h — the user wants to catch 15+ pip moves quickly)
PRIMARY_HORIZON = "outcome_1h"

# Categorical filters (same as session-based system)
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
    "timestamp", "date", "pair", "bar_count", "atr",
    "hour_of_day", "day_of_week",
    "window_ohlc", "vector",
    "outcome_1h", "outcome_2h", "outcome_4h",
    "orb_high", "orb_low", "ib_high", "ib_low",
}

SNAPSHOT_PATH = Path(__file__).parent / "snapshots_24h.parquet"
OUTPUT_DIR = Path(__file__).parent


# ═══════════════════════════════════════════════════════════════════════
# PHASE 1: LOAD DATA
# ═══════════════════════════════════════════════════════════════════════


def load_snapshots():
    """Load 24h snapshots from parquet into structured records."""
    print("=" * 70)
    print("PHASE 1: LOADING 24H SNAPSHOTS")
    print("=" * 70)

    df = pd.read_parquet(SNAPSHOT_PATH)
    print(f"  Loaded {len(df):,} snapshots")
    print(f"  Columns: {len(df.columns)}")
    print(f"  Date range: {df['date'].min()} to {df['date'].max()}")

    records = []
    skipped = 0
    for _, row in df.iterrows():
        # Parse outcome
        outcome = json.loads(row[PRIMARY_HORIZON]) if row[PRIMARY_HORIZON] else {}
        if not outcome or "direction" not in outcome:
            skipped += 1
            continue

        # Parse vector
        vec = np.frombuffer(row["vector"], dtype=np.float64).copy()
        if len(vec) != VECTOR_DIMS:
            skipped += 1
            continue

        # Parse date
        d = row["date"]
        if isinstance(d, str):
            d = date.fromisoformat(d)

        # Build metadata from all filter columns
        metadata = {}
        for col in df.columns:
            if col in EXCLUDE:
                continue
            val = row[col]
            if pd.isna(val):
                continue
            if isinstance(val, (np.integer, np.int64)):
                metadata[col] = int(val)
            elif isinstance(val, (np.floating, np.float64)):
                metadata[col] = float(val)
            elif isinstance(val, np.bool_):
                metadata[col] = bool(val)
            else:
                metadata[col] = val

        change_pips = outcome.get("change_pips", 0)
        abs_pips = outcome.get("abs_change_pips", 0)

        records.append({
            "date": d,
            "timestamp": row["timestamp"],
            "hour_of_day": row.get("hour_of_day", 0),
            "vector": vec,
            "metadata": metadata,
            "outcome": outcome,
            "next_change_pips": change_pips,
            "next_abs_change": abs_pips,
            "next_direction": 1 if change_pips > 1 else (-1 if change_pips < -1 else 0),
            "big_move": outcome.get("big_move", False),
        })

    print(f"  Valid records: {len(records):,}  (skipped {skipped})")

    # Quick stats
    changes = [r["next_change_pips"] for r in records]
    abs_changes = [r["next_abs_change"] for r in records]
    big_moves = sum(1 for r in records if r["big_move"])
    bull = sum(1 for c in changes if c > 1)
    bear = sum(1 for c in changes if c < -1)
    print(f"  Bullish: {bull:,} ({100*bull/len(records):.1f}%)")
    print(f"  Bearish: {bear:,} ({100*bear/len(records):.1f}%)")
    print(f"  Big moves (15+ pips): {big_moves:,} ({100*big_moves/len(records):.1f}%)")

    return records


# ═══════════════════════════════════════════════════════════════════════
# PHASE 2: INDIVIDUAL FILTER RANKING (TRAINING ONLY)
# ═══════════════════════════════════════════════════════════════════════


def rank_individual_filters(train_records):
    """Rank filters by how much they separate big-move vs small-move outcomes."""
    print("\n" + "=" * 70)
    print("PHASE 2: INDIVIDUAL FILTER RANKING (TRAINING ONLY)")
    print(f"  Training records: {len(train_records):,}")
    print("=" * 70)

    # Build DataFrame
    rows = []
    for r in train_records:
        row = {"next_abs": r["next_abs_change"]}
        for k, v in r["metadata"].items():
            if k not in EXCLUDE:
                row[k] = v
        rows.append(row)
    df = pd.DataFrame(rows)

    results = []
    for col in df.columns:
        if col == "next_abs" or col in EXCLUDE:
            continue
        if df[col].nunique() < 2:
            continue

        valid = df[[col, "next_abs"]].dropna()
        if len(valid) < 100:
            continue

        if col in CATEGORICAL or valid[col].dtype == object or valid[col].dtype == bool:
            groups = valid.groupby(col)["next_abs"].agg(["mean", "count"])
            groups = groups[groups["count"] >= 20]
            if len(groups) < 2:
                continue
            spread = groups["mean"].max() - groups["mean"].min()
            results.append({"filter": col, "spread": spread, "type": "categorical"})
        else:
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

    print(f"\n  Top 20 filters by spread:")
    for i, r in enumerate(results[:20]):
        print(f"    {i+1:>2}. {r['filter']:<45} spread={r['spread']:.2f} pips  ({r['type']})")

    return results


# ═══════════════════════════════════════════════════════════════════════
# PHASE 3: COMBO DISCOVERY (TRAINING ONLY)
# ═══════════════════════════════════════════════════════════════════════


def discover_combos(train_records, filter_rankings, top_n_filters=15):
    """Discover best filter combos from training data only."""
    print("\n" + "=" * 70)
    print("PHASE 3: COMBO DISCOVERY (TRAINING ONLY)")
    print("=" * 70)

    top_filters = [r["filter"] for r in filter_rankings[:top_n_filters]]

    # Build DataFrame
    rows = []
    for r in train_records:
        row = {"next_abs": r["next_abs_change"]}
        for k, v in r["metadata"].items():
            row[k] = v
        rows.append(row)
    train_df = pd.DataFrame(rows)

    # Compute tercile boundaries from training
    tercile_boundaries = {}
    for filt in top_filters:
        if filt in CATEGORICAL:
            continue
        col = train_df[filt].dropna()
        if len(col) >= 30:
            tercile_boundaries[filt] = [float(col.quantile(1/3)), float(col.quantile(2/3))]

    # Test pairs
    print(f"\n  Testing pairs from top {min(12, len(top_filters))} filters...")
    all_combos = []

    for f1, f2 in itertools.combinations(top_filters[:12], 2):
        result = _evaluate_combo(train_df, [f1, f2])
        if result and result["spread"] > 1:
            all_combos.append(result)

    print(f"  Found {len(all_combos)} significant pairs")

    # Test triples
    print(f"  Testing triples from top {min(10, len(top_filters))} filters...")
    n_before = len(all_combos)
    for f1, f2, f3 in itertools.combinations(top_filters[:10], 3):
        result = _evaluate_combo(train_df, [f1, f2, f3])
        if result and result["spread"] > 2:
            all_combos.append(result)

    print(f"  Found {len(all_combos) - n_before} significant triples")

    # Sort and select diverse set
    all_combos.sort(key=lambda x: x["spread"], reverse=True)
    selected = _select_diverse(all_combos, max_combos=15)

    print(f"\n  Selected {len(selected)} combos for testing:")
    for i, c in enumerate(selected):
        print(f"    {i+1:>2}. [{c['best_group']}]  mean={c['best_mean']:.1f}p  "
              f"n={c['best_count']}  spread={c['spread']:.1f}p  filters={c['filters']}")

    return selected, tercile_boundaries


def _evaluate_combo(df, filters):
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
        index=valid.index,
    )

    grouped = valid.groupby(combo_key)["next_abs"].agg(["mean", "count", "std"])
    grouped = grouped[grouped["count"] >= 10]
    if len(grouped) < 2:
        return None

    best_group = grouped["mean"].idxmax()

    return {
        "filters": list(filters),
        "best_group": best_group,
        "best_mean": float(grouped.loc[best_group, "mean"]),
        "best_count": int(grouped.loc[best_group, "count"]),
        "spread": float(grouped["mean"].max() - grouped["mean"].min()),
    }


def _select_diverse(all_results, max_combos=15):
    """Select a diverse set of combos."""
    selected = []
    used = set()

    for result in all_results:
        key = frozenset(result["filters"])
        if key in used:
            continue
        if result["best_count"] < 15:
            continue
        used.add(key)
        selected.append(result)
        if len(selected) >= max_combos:
            break

    if len(selected) < 8:
        for result in all_results:
            key = frozenset(result["filters"])
            if key in used:
                continue
            if result["best_count"] < 10:
                continue
            used.add(key)
            selected.append(result)
            if len(selected) >= max_combos:
                break

    return selected


# ═══════════════════════════════════════════════════════════════════════
# MATCHING & FORECASTING
# ═══════════════════════════════════════════════════════════════════════


def record_matches_group(record, filters, group_label, tercile_boundaries):
    """Check if a record matches a specific filter group."""
    parts = group_label.split("_")
    meta = record["metadata"]

    part_idx = 0
    for filt in filters:
        if part_idx >= len(parts):
            return False

        if filt in CATEGORICAL or filt == "session_name":
            actual_val = str(meta.get(filt, ""))
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


def forecast_from_neighbors(test_record, train_matches, top_n=TOP_N_NEIGHBORS):
    """Find N closest vector matches and forecast via distance weighting."""
    if len(train_matches) < 3:
        return None

    query_vec = test_record["vector"]
    train_vectors = np.array([r["vector"] for r in train_matches])
    distances = batch_distances(query_vec, train_vectors, metric="euclidean")

    n = min(top_n, len(distances))
    top_idx = np.argsort(distances)[:n]

    top_distances = distances[top_idx]
    weights = 1.0 / (top_distances + 1e-8)
    weights /= weights.sum()

    changes = np.array([train_matches[i]["next_change_pips"] for i in top_idx])
    abs_changes = np.array([train_matches[i]["next_abs_change"] for i in top_idx])

    weighted_change = float(np.sum(weights * changes))
    weighted_abs = float(np.sum(weights * abs_changes))
    direction_score = float(np.sum(weights * np.sign(changes)))

    bull_count = np.sum(changes > 0)
    bull_pct = float(bull_count / n * 100)

    mean_distance = float(np.mean(top_distances))
    distance_quality = 1.0 / (1.0 + mean_distance)
    agreement = max(bull_pct, 100 - bull_pct) / 100
    sample_factor = min(1.0, np.log(n + 1) / np.log(51))
    magnitude_cv = float(np.std(abs_changes) / max(np.mean(abs_changes), 0.1))
    magnitude_consistency = 1.0 / (1.0 + magnitude_cv)

    confidence = (
        0.35 * distance_quality +
        0.35 * agreement +
        0.15 * sample_factor +
        0.15 * magnitude_consistency
    )

    return {
        "predicted_change": weighted_change,
        "predicted_abs": weighted_abs,
        "predicted_direction": 1 if direction_score > 0.1 else (-1 if direction_score < -0.1 else 0),
        "direction_score": float(direction_score),
        "bull_pct": bull_pct,
        "confidence": float(confidence),
        "mean_distance": mean_distance,
        "n_matches": n,
        "n_pool": len(train_matches),
    }


# ═══════════════════════════════════════════════════════════════════════
# PHASE 4: WALK-FORWARD ACCURACY TEST
# ═══════════════════════════════════════════════════════════════════════


def walk_forward_test(train, test, combos, tercile_boundaries):
    """Test each combo out-of-sample with vector search."""
    print("\n" + "=" * 70)
    print("PHASE 4: WALK-FORWARD ACCURACY TEST (OUT-OF-SAMPLE)")
    print(f"  Train: {len(train):,} | Test: {len(test):,}")
    print("=" * 70)

    baseline = compute_baseline(test)
    print(f"\n  Baseline (all test, no filter):")
    print(f"    Mean abs: {baseline['mean_abs']}p | Median: {baseline['median_abs']}p | "
          f"Bull%: {baseline['bull_pct']}%")

    all_results = []
    combo_predictions = {}

    for i, combo in enumerate(combos):
        filters = combo["filters"]
        group = combo["best_group"]

        print(f"\n  Combo {i+1}/{len(combos)}: {filters} → [{group}]")

        train_matches = [r for r in train if record_matches_group(r, filters, group, tercile_boundaries)]
        test_matches = [r for r in test if record_matches_group(r, filters, group, tercile_boundaries)]

        if not train_matches or not test_matches:
            print(f"    SKIPPED (no matches)")
            continue

        predictions = []
        for test_r in test_matches:
            forecast = forecast_from_neighbors(test_r, train_matches)
            if forecast is None:
                continue

            actual_change = test_r["next_change_pips"]
            actual_dir = 1 if actual_change > 1 else (-1 if actual_change < -1 else 0)

            predictions.append({
                "date": test_r["date"],
                "timestamp": test_r["timestamp"],
                "forecast": forecast,
                "actual_change": actual_change,
                "actual_abs": test_r["next_abs_change"],
                "actual_dir": actual_dir,
                "big_move": test_r["big_move"],
                "test_record": test_r,
            })

        if not predictions:
            print(f"    SKIPPED (no predictions)")
            continue

        result = compute_accuracy_metrics(combo, train_matches, predictions)
        all_results.append(result)
        combo_predictions[group] = {
            "combo": combo,
            "train_matches": train_matches,
            "predictions": predictions,
        }

        print(f"    Pool: {len(train_matches)} | Triggers: {len(test_matches)} | "
              f"Predictions: {len(predictions)}")
        print(f"    Dir accuracy: {result['direction_accuracy']}% "
              f"(hi-conf: {result['high_conf_accuracy']}%, n={result['high_conf_count']})")
        print(f"    Big move capture: {result['big_move_capture_rate']}% of predictions had 15+ pip moves")
        print(f"    P&L: {result['total_pnl_pips']:+.1f} pips | Win rate: {result['win_rate']}%")

    all_results.sort(key=lambda r: r["direction_accuracy"], reverse=True)
    return all_results, combo_predictions, baseline


def compute_baseline(test):
    """Baseline stats for the test period."""
    abs_changes = [r["next_abs_change"] for r in test]
    changes = [r["next_change_pips"] for r in test]
    bull = sum(1 for c in changes if c > 1)
    big = sum(1 for r in test if r["big_move"])

    return {
        "n": len(test),
        "mean_abs": round(float(np.mean(abs_changes)), 1),
        "median_abs": round(float(np.median(abs_changes)), 1),
        "p90_abs": round(float(np.percentile(abs_changes, 90)), 1),
        "bull_pct": round(100 * bull / len(test), 1),
        "big_move_pct": round(100 * big / len(test), 1),
    }


def compute_accuracy_metrics(combo, train_matches, predictions):
    """Compute accuracy metrics."""
    n = len(predictions)

    # Direction accuracy (only when directional call is made)
    dir_correct = 0
    dir_total = 0
    for p in predictions:
        pred_dir = p["forecast"]["predicted_direction"]
        if pred_dir != 0 and p["actual_dir"] != 0:
            dir_total += 1
            if pred_dir == p["actual_dir"]:
                dir_correct += 1
    dir_accuracy = dir_correct / max(dir_total, 1) * 100

    # Big move capture: how many predictions happened before a 15+ pip move?
    big_move_captures = sum(1 for p in predictions if p["big_move"])
    big_move_rate = big_move_captures / max(n, 1) * 100

    # Magnitude
    actual_abs = [p["actual_abs"] for p in predictions]
    predicted_abs = [p["forecast"]["predicted_abs"] for p in predictions]
    mag_errors = [abs(a - p) for a, p in zip(actual_abs, predicted_abs)]

    # P&L simulation
    pnl_list = []
    for p in predictions:
        pred_dir = p["forecast"]["predicted_direction"]
        if pred_dir != 0:
            pnl_list.append(pred_dir * p["actual_change"])

    total_pnl = sum(pnl_list) if pnl_list else 0
    win_trades = sum(1 for p in pnl_list if p > 0)
    win_rate = win_trades / max(len(pnl_list), 1) * 100

    # High-confidence accuracy
    high_conf = [p for p in predictions if p["forecast"]["confidence"] >= 0.5]
    hc_correct = sum(
        1 for p in high_conf
        if p["forecast"]["predicted_direction"] != 0
        and p["actual_dir"] != 0
        and p["forecast"]["predicted_direction"] == p["actual_dir"]
    )
    hc_total = sum(1 for p in high_conf if p["forecast"]["predicted_direction"] != 0 and p["actual_dir"] != 0)
    hc_accuracy = hc_correct / max(hc_total, 1) * 100

    mean_conf = float(np.mean([p["forecast"]["confidence"] for p in predictions]))

    return {
        "combo_filters": combo["filters"],
        "combo_group": combo["best_group"],
        "combo_train_mean": round(combo["best_mean"], 1),
        "combo_spread": round(combo["spread"], 1),
        "train_pool": len(train_matches),
        "predictions_made": n,
        "direction_accuracy": round(dir_accuracy, 1),
        "direction_calls": dir_total,
        "high_conf_accuracy": round(hc_accuracy, 1),
        "high_conf_count": len(high_conf),
        "mean_confidence": round(mean_conf, 3),
        "big_move_capture_rate": round(big_move_rate, 1),
        "big_move_captures": big_move_captures,
        "actual_mean_abs": round(float(np.mean(actual_abs)), 1),
        "actual_median_abs": round(float(np.median(actual_abs)), 1),
        "predicted_mean_abs": round(float(np.mean(predicted_abs)), 1),
        "magnitude_mae": round(float(np.mean(mag_errors)), 1),
        "total_pnl_pips": round(float(total_pnl), 1),
        "win_rate": round(float(win_rate), 1),
        "trades": len(pnl_list),
    }


# ═══════════════════════════════════════════════════════════════════════
# PHASE 5: STRESS TESTS
# ═══════════════════════════════════════════════════════════════════════


def direction_accuracy(predictions):
    """Compute direction accuracy from predictions list."""
    correct = 0
    total = 0
    for p in predictions:
        pred_dir = p["forecast"]["predicted_direction"]
        if pred_dir != 0 and p["actual_dir"] != 0:
            total += 1
            if pred_dir == p["actual_dir"]:
                correct += 1
    return correct / max(total, 1) * 100


def stress_test_permutation(combo_predictions, test, n_perms=1000):
    """Shuffle outcomes and re-measure. Real edge → p < 0.01."""
    print("\n" + "=" * 70)
    print("STRESS TEST 1: PERMUTATION (1000 shuffles)")
    print("=" * 70)

    all_test_changes = [r["next_change_pips"] for r in test]

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        actual_acc = direction_accuracy(preds)
        n_preds = len(preds)

        shuffled_accs = []
        for _ in range(n_perms):
            shuffled_changes = np.random.choice(all_test_changes, size=n_preds, replace=True)
            correct = 0
            total = 0
            for i, p in enumerate(preds):
                pred_dir = p["forecast"]["predicted_direction"]
                if pred_dir != 0:
                    total += 1
                    shuffled_dir = 1 if shuffled_changes[i] > 1 else (-1 if shuffled_changes[i] < -1 else 0)
                    if shuffled_dir != 0 and pred_dir == shuffled_dir:
                        correct += 1
            shuffled_accs.append(correct / max(total, 1) * 100)

        shuffled_arr = np.array(shuffled_accs)
        p_value = np.mean(shuffled_arr >= actual_acc)
        verdict = "REAL EDGE" if p_value < 0.01 else ("LIKELY EDGE" if p_value < 0.05 else "NOT SIGNIFICANT")

        print(f"\n  [{group_name}] (n={n_preds})")
        print(f"    Actual: {actual_acc:.1f}%  Shuffled mean: {shuffled_arr.mean():.1f}%  "
              f"p={p_value:.4f}  → {verdict}")


def stress_test_random_combos(train, test, tercile_boundaries, n_random=100):
    """Test random filter combos through the same pipeline."""
    print("\n" + "=" * 70)
    print(f"STRESS TEST 2: RANDOM COMBO BASELINE ({n_random} random combos)")
    print("=" * 70)

    sample_meta = train[0]["metadata"]
    all_keys = [k for k, v in sample_meta.items()
                if k not in EXCLUDE and not isinstance(v, dict) and isinstance(v, (int, float, str, bool))]

    rows = []
    for r in train:
        row = {"next_abs": r["next_abs_change"]}
        for k, v in r["metadata"].items():
            row[k] = v
        rows.append(row)
    train_df = pd.DataFrame(rows)

    random_accs = []
    attempts = 0
    found = 0

    while found < n_random and attempts < n_random * 5:
        attempts += 1
        n_filters = np.random.choice([2, 3])
        chosen = list(np.random.choice(all_keys, size=min(n_filters, len(all_keys)), replace=False))

        valid = train_df.dropna(subset=chosen + ["next_abs"])
        if len(valid) < 50:
            continue

        disc_cols = []
        skip = False
        for f in chosen:
            if f in CATEGORICAL or (f in valid.columns and valid[f].dtype == object):
                disc_cols.append(valid[f].astype(str))
            else:
                try:
                    disc_cols.append(pd.qcut(valid[f], 3, labels=["low", "mid", "high"], duplicates="drop"))
                except (ValueError, TypeError):
                    skip = True
                    break
        if skip:
            continue

        combo_key = pd.Series(
            ["_".join(str(x) for x in row) for row in zip(*disc_cols)],
            index=valid.index,
        )
        grouped = valid.groupby(combo_key)["next_abs"].agg(["mean", "count"])
        grouped = grouped[grouped["count"] >= 10]
        if len(grouped) < 2:
            continue

        best_group = grouped["mean"].idxmax()
        if int(grouped.loc[best_group, "count"]) < 15:
            continue

        combo = {"filters": chosen, "best_group": best_group,
                 "best_mean": float(grouped.loc[best_group, "mean"]),
                 "best_count": int(grouped.loc[best_group, "count"]),
                 "spread": float(grouped["mean"].max() - grouped["mean"].min())}

        train_m = [r for r in train if record_matches_group(r, chosen, best_group, tercile_boundaries)]
        test_m = [r for r in test if record_matches_group(r, chosen, best_group, tercile_boundaries)]

        if len(train_m) < 3 or len(test_m) < 5:
            continue

        preds = []
        for t in test_m:
            fc = forecast_from_neighbors(t, train_m)
            if fc is None:
                continue
            actual_dir = 1 if t["next_change_pips"] > 1 else (-1 if t["next_change_pips"] < -1 else 0)
            preds.append({"forecast": fc, "actual_dir": actual_dir,
                          "actual_change": t["next_change_pips"], "actual_abs": t["next_abs_change"]})

        if len(preds) < 5:
            continue

        acc = direction_accuracy(preds)
        random_accs.append(acc)
        found += 1

    if not random_accs:
        print("  Could not generate valid random combos.")
        return

    accs = np.array(random_accs)
    print(f"\n  {len(random_accs)} random combos tested:")
    print(f"    Mean: {accs.mean():.1f}%  Median: {np.median(accs):.1f}%  "
          f"Std: {accs.std():.1f}%  Max: {accs.max():.1f}%")
    print(f"    >60%: {(accs > 60).mean()*100:.0f}%  >70%: {(accs > 70).mean()*100:.0f}%  "
          f">75%: {(accs > 75).mean()*100:.0f}%  >80%: {(accs > 80).mean()*100:.0f}%")


def stress_test_temporal_stability(combo_predictions):
    """Accuracy by quarter."""
    print("\n" + "=" * 70)
    print("STRESS TEST 3: TEMPORAL STABILITY")
    print("=" * 70)

    quarters = [
        ("2024-Q3", date(2024, 7, 1), date(2024, 9, 30)),
        ("2024-Q4", date(2024, 10, 1), date(2024, 12, 31)),
        ("2025-Q1", date(2025, 1, 1), date(2025, 3, 31)),
        ("2025-Q2", date(2025, 4, 1), date(2025, 6, 30)),
        ("2025-Q3", date(2025, 7, 1), date(2025, 9, 30)),
        ("2025-Q4+", date(2025, 10, 1), date(2026, 12, 31)),
    ]

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        overall = direction_accuracy(preds)
        print(f"\n  [{group_name}] overall={overall:.1f}% (n={len(preds)})")

        q_accs = []
        for q_name, q_start, q_end in quarters:
            q_preds = [p for p in preds if q_start <= p["date"] <= q_end]
            if not q_preds:
                continue
            q_acc = direction_accuracy(q_preds)
            q_accs.append(q_acc)
            bar = "#" * int(q_acc / 5)
            print(f"    {q_name}: {q_acc:5.1f}% (n={len(q_preds):>4})  {bar}")

        if len(q_accs) >= 2:
            print(f"    Stability (std): {np.std(q_accs):.1f}%  Min: {min(q_accs):.1f}%")


def stress_test_bootstrap(combo_predictions, n_bootstrap=2000):
    """Bootstrap 95% confidence intervals."""
    print("\n" + "=" * 70)
    print(f"STRESS TEST 4: BOOTSTRAP CI ({n_bootstrap} resamples)")
    print("=" * 70)

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        n = len(preds)
        actual_acc = direction_accuracy(preds)

        boot_accs = []
        for _ in range(n_bootstrap):
            boot_idx = np.random.choice(n, size=n, replace=True)
            boot_preds = [preds[i] for i in boot_idx]
            boot_accs.append(direction_accuracy(boot_preds))

        boot_arr = np.array(boot_accs)
        ci_lo = np.percentile(boot_arr, 2.5)
        ci_hi = np.percentile(boot_arr, 97.5)

        above_50 = "ABOVE 50%" if ci_lo > 50 else "INCLUDES 50%"
        print(f"  [{group_name}] (n={n})  {actual_acc:.1f}%  95% CI=[{ci_lo:.1f}%, {ci_hi:.1f}%]  {above_50}")


def stress_test_naive_baselines(combo_predictions, train, test):
    """Compare against naive strategies."""
    print("\n" + "=" * 70)
    print("STRESS TEST 5: NAIVE BASELINES")
    print("=" * 70)

    train_changes = [r["next_change_pips"] for r in train]
    train_bull_pct = sum(1 for c in train_changes if c > 1) / len(train_changes) * 100
    train_majority = 1 if train_bull_pct > 50 else -1

    print(f"  Training bias: {train_bull_pct:.1f}% bullish")

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        n = len([p for p in preds if p["actual_dir"] != 0])
        actual_acc = direction_accuracy(preds)

        # Always bull
        always_bull = sum(1 for p in preds if p["actual_dir"] == 1 and p["actual_dir"] != 0) / max(n, 1) * 100
        # Train majority
        train_maj_acc = sum(1 for p in preds if p["actual_dir"] == train_majority and p["actual_dir"] != 0) / max(n, 1) * 100

        # Filter-only (no vector)
        tm = data["train_matches"]
        tm_changes = [r["next_change_pips"] for r in tm]
        tm_bull_pct = sum(1 for c in tm_changes if c > 1) / max(len(tm_changes), 1)
        filter_majority = 1 if tm_bull_pct > 0.5 else -1
        filter_only_acc = sum(1 for p in preds if p["actual_dir"] == filter_majority and p["actual_dir"] != 0) / max(n, 1) * 100

        best_naive = max(always_bull, train_maj_acc, filter_only_acc)
        edge = actual_acc - best_naive

        print(f"\n  [{group_name}] (n={len(preds)})")
        print(f"    Our model:      {actual_acc:5.1f}%")
        print(f"    Always bull:    {always_bull:5.1f}%")
        print(f"    Train majority: {train_maj_acc:5.1f}%")
        print(f"    Filter-only:    {filter_only_acc:5.1f}%")
        print(f"    Edge vs best:   {edge:+.1f}pp")
        if edge < 5:
            print(f"    WARNING: Thin edge over naive baseline")


def stress_test_vector_value(combo_predictions):
    """Does vector search add value over filter-only?"""
    print("\n" + "=" * 70)
    print("STRESS TEST 6: VECTOR SEARCH VALUE-ADD")
    print("=" * 70)

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        train_matches = data["train_matches"]

        vector_acc = direction_accuracy(preds)

        # Flat: majority of all train matches
        tm_changes = [r["next_change_pips"] for r in train_matches]
        mean_ch = np.mean(tm_changes)
        flat_dir = 1 if mean_ch > 1 else (-1 if mean_ch < -1 else 0)

        flat_correct = sum(1 for p in preds if flat_dir != 0 and p["actual_dir"] != 0 and flat_dir == p["actual_dir"])
        flat_total = sum(1 for p in preds if flat_dir != 0 and p["actual_dir"] != 0)
        flat_acc = flat_correct / max(flat_total, 1) * 100

        edge = vector_acc - flat_acc

        print(f"  [{group_name}] Vector={vector_acc:.1f}%  Flat={flat_acc:.1f}%  Edge={edge:+.1f}pp")


# ═══════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════


def print_summary(all_results, baseline):
    """Print summary scorecard."""
    print("\n\n" + "=" * 70)
    print("SUMMARY SCORECARD — 24H ROLLING SYSTEM")
    print("=" * 70)

    print(f"\n  Baseline: {baseline['n']:,} test checkpoints | "
          f"mean={baseline['mean_abs']}p | bull={baseline['bull_pct']}% | "
          f"big moves={baseline['big_move_pct']}%")

    print(f"\n  {'#':>2} {'Group':<45} {'Pool':>5} {'Pred':>5} {'Dir%':>5} "
          f"{'HiCf%':>5} {'BigM%':>5} {'MeanP':>6} {'P&L':>8} {'WR%':>5}")
    print("  " + "-" * 110)

    for i, r in enumerate(all_results):
        print(f"  {i+1:>2} {r['combo_group']:<45} "
              f"{r['train_pool']:>5} {r['predictions_made']:>5} "
              f"{r['direction_accuracy']:>5.1f} {r['high_conf_accuracy']:>5.1f} "
              f"{r['big_move_capture_rate']:>5.1f} {r['actual_mean_abs']:>6.1f} "
              f"{r['total_pnl_pips']:>+8.1f} {r['win_rate']:>5.1f}")


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════


def main():
    print("=" * 70)
    print("24-HOUR FILTER ANALYSIS PIPELINE")
    print("No session boundaries — rolling 4h windows, hourly checkpoints")
    print(f"Train: ≤ {TRAIN_END}  |  Test: > {TRAIN_END}")
    print("=" * 70)

    # Phase 1: Load
    records = load_snapshots()

    # Split
    train = sorted([r for r in records if r["date"] <= TRAIN_END], key=lambda r: r["date"])
    test = sorted([r for r in records if r["date"] > TRAIN_END], key=lambda r: r["date"])
    print(f"\n  Train: {len(train):,}  ({train[0]['date']} to {train[-1]['date']})")
    print(f"  Test:  {len(test):,}  ({test[0]['date']} to {test[-1]['date']})")

    # Phase 2: Rank individual filters
    filter_rankings = rank_individual_filters(train)

    # Phase 3: Discover combos
    combos, tercile_boundaries = discover_combos(train, filter_rankings)

    # Phase 4: Walk-forward test
    all_results, combo_predictions, baseline = walk_forward_test(
        train, test, combos, tercile_boundaries
    )

    if not all_results:
        print("\nNo combos produced testable results. Exiting.")
        return

    print_summary(all_results, baseline)

    # Phase 5: Stress tests
    print("\n\n" + "=" * 70)
    print("PHASE 5: STRESS TESTS — IS THIS REAL?")
    print("=" * 70)

    stress_test_permutation(combo_predictions, test)
    stress_test_random_combos(train, test, tercile_boundaries, n_random=50)
    stress_test_temporal_stability(combo_predictions)
    stress_test_bootstrap(combo_predictions)
    stress_test_naive_baselines(combo_predictions, train, test)
    stress_test_vector_value(combo_predictions)

    # Save results
    output = {
        "config": {
            "train_end": str(TRAIN_END),
            "top_n_neighbors": TOP_N_NEIGHBORS,
            "primary_horizon": PRIMARY_HORIZON,
            "window_bars": 240,
            "step_bars": 60,
        },
        "baseline": baseline,
        "tercile_boundaries": tercile_boundaries,
        "filter_rankings_top20": filter_rankings[:20],
        "results": all_results,
    }
    output_path = OUTPUT_DIR / "analysis_results_24h.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n\nResults saved to {output_path}")

    # Final verdict
    print("\n" + "=" * 70)
    print("FINAL VERDICT")
    print("=" * 70)
    accs = [r["direction_accuracy"] for r in all_results]
    pnls = [r["total_pnl_pips"] for r in all_results]
    print(f"  Combos tested: {len(all_results)}")
    print(f"  Accuracy range: {min(accs):.1f}% – {max(accs):.1f}%")
    print(f"  Mean accuracy: {np.mean(accs):.1f}%")
    print(f"  Profitable combos: {sum(1 for p in pnls if p > 0)}/{len(pnls)}")
    print(f"  Total P&L (all combos): {sum(pnls):+.1f} pips")


if __name__ == "__main__":
    main()
