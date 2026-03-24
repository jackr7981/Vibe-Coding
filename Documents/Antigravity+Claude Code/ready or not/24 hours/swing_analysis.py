#!/usr/bin/env python3
"""Swing-Based 24h Analysis — Find Big Moves, Then Find What Predicted Them.

Approach (matches user's request directly):
  1. Scan 5 years of 1-min bars for all 15+ pip directional swings
  2. For each swing: look back at the prior 4h window, compute filters
  3. Find which filter combinations commonly aligned BEFORE big swings
  4. Test: when those combinations align in the future, does a big move follow?

This is fundamentally different from the rolling approach:
  - Rolling: check every hour, predict what happens next
  - Swing: start from the MOVES, work backwards to find precursors

Also tests multiple outcome horizons (1h, 2h, 4h) to find where signal lives.

Split:
  Train: ≤ 2024-06-30  |  Test: > 2024-06-30
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
TOP_N_NEIGHBORS = 30
VECTOR_DIMS = 119

# Test all three horizons
HORIZONS = ["outcome_1h", "outcome_2h", "outcome_4h"]
HORIZON_LABELS = {"outcome_1h": "1h", "outcome_2h": "2h", "outcome_4h": "4h"}

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
# PHASE 1: LOAD AND TAG SWINGS
# ═══════════════════════════════════════════════════════════════════════


def load_and_tag_swings():
    """Load snapshots and identify which ones precede big swings."""
    print("=" * 70)
    print("SWING-BASED 24H ANALYSIS")
    print("Find 15+ pip moves → find what filters aligned before them")
    print("=" * 70)

    df = pd.read_parquet(SNAPSHOT_PATH)
    print(f"\n  Loaded {len(df):,} snapshots")

    # Build records for each horizon
    all_records = {}

    for horizon in HORIZONS:
        label = HORIZON_LABELS[horizon]
        records = []

        for _, row in df.iterrows():
            outcome = json.loads(row[horizon]) if row[horizon] else {}
            if not outcome or "direction" not in outcome:
                continue

            vec = np.frombuffer(row["vector"], dtype=np.float64).copy()
            if len(vec) != VECTOR_DIMS:
                continue

            d = row["date"]
            if isinstance(d, str):
                d = date.fromisoformat(d)

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
            big_move = outcome.get("big_move", False)
            max_up = outcome.get("max_up_pips", 0)
            max_down = outcome.get("max_down_pips", 0)

            # Also check max excursion for swings
            has_swing = max(max_up, max_down) >= 15

            records.append({
                "date": d,
                "timestamp": row["timestamp"],
                "hour_of_day": row.get("hour_of_day", 0),
                "vector": vec,
                "metadata": metadata,
                "change_pips": change_pips,
                "abs_change_pips": abs_pips,
                "direction": 1 if change_pips > 1 else (-1 if change_pips < -1 else 0),
                "big_move": big_move,
                "has_swing": has_swing,
                "max_up": max_up,
                "max_down": max_down,
            })

        all_records[horizon] = records

        # Stats
        big = sum(1 for r in records if r["big_move"])
        swings = sum(1 for r in records if r["has_swing"])
        print(f"\n  {label} horizon: {len(records):,} checkpoints")
        print(f"    Big moves (close-to-close ≥15p): {big:,} ({100*big/len(records):.1f}%)")
        print(f"    Swings (max excursion ≥15p):     {swings:,} ({100*swings/len(records):.1f}%)")

    return all_records


# ═══════════════════════════════════════════════════════════════════════
# PHASE 2: FIND WHICH FILTERS SEPARATE SWINGS FROM NON-SWINGS
# ═══════════════════════════════════════════════════════════════════════


def rank_swing_predictors(train_records):
    """Find filters that best separate 'swing follows' from 'no swing follows'."""
    print("\n" + "=" * 70)
    print("PHASE 2: SWING PREDICTOR RANKING")
    print("  Which filters differ between 'big move follows' vs 'small move follows'?")
    print("=" * 70)

    # Build DataFrame with swing flag
    rows = []
    for r in train_records:
        row = {"has_swing": r["has_swing"], "abs_change": r["abs_change_pips"],
               "direction": r["direction"]}
        for k, v in r["metadata"].items():
            if k not in EXCLUDE:
                row[k] = v
        rows.append(row)
    df = pd.DataFrame(rows)

    swing_df = df[df["has_swing"]]
    no_swing_df = df[~df["has_swing"]]
    print(f"  Swing: {len(swing_df):,}  No-swing: {len(no_swing_df):,}")

    results = []
    for col in df.columns:
        if col in ("has_swing", "abs_change", "direction") or col in EXCLUDE:
            continue
        if df[col].nunique() < 2:
            continue

        valid = df[[col, "has_swing"]].dropna()
        if len(valid) < 100:
            continue

        if col in CATEGORICAL or valid[col].dtype == object or valid[col].dtype == bool:
            # For categorical: compare swing rate across categories
            groups = valid.groupby(col)["has_swing"].agg(["mean", "count"])
            groups = groups[groups["count"] >= 20]
            if len(groups) < 2:
                continue
            spread = groups["mean"].max() - groups["mean"].min()
            best_cat = groups["mean"].idxmax()
            best_rate = groups.loc[best_cat, "mean"]
            results.append({
                "filter": col, "spread": spread * 100,
                "type": "categorical",
                "best_value": str(best_cat),
                "best_swing_rate": round(best_rate * 100, 1),
            })
        else:
            # Numeric: compare swing rates across terciles
            try:
                valid["q"] = pd.qcut(valid[col], 3, labels=["low", "mid", "high"], duplicates="drop")
            except ValueError:
                continue
            groups = valid.groupby("q")["has_swing"].agg(["mean", "count"])
            if len(groups) < 2:
                continue
            spread = groups["mean"].max() - groups["mean"].min()
            best_q = groups["mean"].idxmax()
            best_rate = groups.loc[best_q, "mean"]
            results.append({
                "filter": col, "spread": spread * 100,
                "type": "numeric",
                "best_value": str(best_q),
                "best_swing_rate": round(best_rate * 100, 1),
            })

    results.sort(key=lambda x: x["spread"], reverse=True)

    base_swing_rate = df["has_swing"].mean() * 100
    print(f"\n  Base swing rate: {base_swing_rate:.1f}%")
    print(f"\n  Top 20 swing predictors:")
    for i, r in enumerate(results[:20]):
        lift = r["best_swing_rate"] / base_swing_rate if base_swing_rate > 0 else 0
        print(f"    {i+1:>2}. {r['filter']:<45} spread={r['spread']:.1f}pp  "
              f"best={r['best_value']}→{r['best_swing_rate']:.1f}% ({lift:.1f}x lift)")

    return results


# ═══════════════════════════════════════════════════════════════════════
# PHASE 3: DISCOVER SWING COMBOS
# ═══════════════════════════════════════════════════════════════════════


def discover_swing_combos(train_records, swing_rankings, top_n=15):
    """Find filter combos that best concentrate swings."""
    print("\n" + "=" * 70)
    print("PHASE 3: SWING COMBO DISCOVERY")
    print("=" * 70)

    top_filters = [r["filter"] for r in swing_rankings[:top_n]]

    rows = []
    for r in train_records:
        row = {"has_swing": r["has_swing"], "abs_change": r["abs_change_pips"],
               "direction": r["direction"]}
        for k, v in r["metadata"].items():
            row[k] = v
        rows.append(row)
    train_df = pd.DataFrame(rows)

    base_rate = train_df["has_swing"].mean()

    # Tercile boundaries
    tercile_boundaries = {}
    for filt in top_filters:
        if filt in CATEGORICAL:
            continue
        col = train_df[filt].dropna()
        if len(col) >= 30:
            tercile_boundaries[filt] = [float(col.quantile(1/3)), float(col.quantile(2/3))]

    # Test pairs
    print(f"  Testing pairs from top {min(12, len(top_filters))} filters...")
    all_combos = []

    for f1, f2 in itertools.combinations(top_filters[:12], 2):
        result = _evaluate_swing_combo(train_df, [f1, f2], base_rate)
        if result and result["swing_rate"] > base_rate * 1.3:
            all_combos.append(result)

    print(f"  Found {len(all_combos)} significant pairs")

    # Test triples
    print(f"  Testing triples from top {min(10, len(top_filters))} filters...")
    n_before = len(all_combos)
    for f1, f2, f3 in itertools.combinations(top_filters[:10], 3):
        result = _evaluate_swing_combo(train_df, [f1, f2, f3], base_rate)
        if result and result["swing_rate"] > base_rate * 1.5:
            all_combos.append(result)

    print(f"  Found {len(all_combos) - n_before} significant triples")

    # Sort by swing rate and select diverse combos
    all_combos.sort(key=lambda x: x["swing_rate"], reverse=True)
    selected = _select_diverse_swing(all_combos, max_combos=15)

    print(f"\n  Base swing rate: {base_rate*100:.1f}%")
    print(f"\n  Selected {len(selected)} combos for testing:")
    for i, c in enumerate(selected):
        lift = c["swing_rate"] / base_rate
        print(f"    {i+1:>2}. [{c['best_group']}]  swing_rate={c['swing_rate']*100:.1f}%  "
              f"({lift:.1f}x lift)  n={c['count']}  filters={c['filters']}")

    return selected, tercile_boundaries


def _evaluate_swing_combo(df, filters, base_rate):
    """Evaluate a combo by swing concentration."""
    valid = df.dropna(subset=list(filters) + ["has_swing"])
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

    grouped = valid.groupby(combo_key)["has_swing"].agg(["mean", "count"])
    grouped = grouped[grouped["count"] >= 15]
    if len(grouped) < 2:
        return None

    best_group = grouped["mean"].idxmax()
    best_rate = float(grouped.loc[best_group, "mean"])
    best_count = int(grouped.loc[best_group, "count"])

    # Also get mean absolute move for this group
    mask = combo_key == best_group
    mean_abs = float(valid.loc[mask, "abs_change"].mean()) if mask.any() else 0

    return {
        "filters": list(filters),
        "best_group": best_group,
        "swing_rate": best_rate,
        "count": best_count,
        "mean_abs": mean_abs,
        "lift": best_rate / max(base_rate, 0.001),
    }


def _select_diverse_swing(all_results, max_combos=15):
    """Select diverse combos."""
    selected = []
    used = set()
    for r in all_results:
        key = frozenset(r["filters"])
        if key in used:
            continue
        if r["count"] < 15:
            continue
        used.add(key)
        selected.append(r)
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

        if filt in CATEGORICAL:
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
    """Vector-weighted forecast."""
    if len(train_matches) < 3:
        return None

    query_vec = test_record["vector"]
    train_vecs = np.array([r["vector"] for r in train_matches])
    distances = batch_distances(query_vec, train_vecs, metric="euclidean")

    n = min(top_n, len(distances))
    top_idx = np.argsort(distances)[:n]

    top_dist = distances[top_idx]
    weights = 1.0 / (top_dist + 1e-8)
    weights /= weights.sum()

    changes = np.array([train_matches[i]["change_pips"] for i in top_idx])
    direction_score = float(np.sum(weights * np.sign(changes)))

    bull_count = np.sum(changes > 1)
    bull_pct = float(bull_count / n * 100)
    mean_distance = float(np.mean(top_dist))
    agreement = max(bull_pct, 100 - bull_pct) / 100

    # What fraction of nearest neighbors had swings?
    swing_neighbors = sum(1 for i in top_idx if train_matches[i]["has_swing"])
    swing_neighbor_rate = swing_neighbors / n

    confidence = (
        0.30 * (1.0 / (1.0 + mean_distance)) +
        0.30 * agreement +
        0.25 * swing_neighbor_rate +
        0.15 * min(1.0, np.log(n + 1) / np.log(51))
    )

    return {
        "predicted_direction": 1 if direction_score > 0.1 else (-1 if direction_score < -0.1 else 0),
        "direction_score": direction_score,
        "bull_pct": bull_pct,
        "confidence": float(confidence),
        "mean_distance": mean_distance,
        "n_matches": n,
        "swing_neighbor_rate": swing_neighbor_rate,
    }


# ═══════════════════════════════════════════════════════════════════════
# PHASE 4: TEST ACROSS ALL HORIZONS
# ═══════════════════════════════════════════════════════════════════════


def test_all_horizons(all_records, combos, tercile_boundaries):
    """Test each combo across 1h, 2h, 4h horizons."""
    print("\n" + "=" * 70)
    print("PHASE 4: WALK-FORWARD TEST ACROSS ALL HORIZONS")
    print("=" * 70)

    results_by_horizon = {}

    for horizon in HORIZONS:
        label = HORIZON_LABELS[horizon]
        records = all_records[horizon]

        train = sorted([r for r in records if r["date"] <= TRAIN_END], key=lambda r: r["date"])
        test = sorted([r for r in records if r["date"] > TRAIN_END], key=lambda r: r["date"])

        # Baseline
        test_dirs = [r["direction"] for r in test if r["direction"] != 0]
        test_bull_pct = sum(1 for d in test_dirs if d == 1) / max(len(test_dirs), 1) * 100
        test_swing_rate = sum(1 for r in test if r["has_swing"]) / max(len(test), 1) * 100

        print(f"\n  ── {label} HORIZON ──")
        print(f"  Train: {len(train):,} | Test: {len(test):,}")
        print(f"  Test baseline: bull={test_bull_pct:.1f}% | swing_rate={test_swing_rate:.1f}%")

        horizon_results = []

        for combo in combos:
            filters = combo["filters"]
            group = combo["best_group"]

            train_m = [r for r in train if record_matches_group(r, filters, group, tercile_boundaries)]
            test_m = [r for r in test if record_matches_group(r, filters, group, tercile_boundaries)]

            if not train_m or len(test_m) < 5:
                continue

            # Metrics
            predictions = []
            for t in test_m:
                fc = forecast_from_neighbors(t, train_m)
                if fc is None:
                    continue
                predictions.append({
                    "date": t["date"],
                    "forecast": fc,
                    "actual_dir": t["direction"],
                    "actual_change": t["change_pips"],
                    "actual_abs": t["abs_change_pips"],
                    "has_swing": t["has_swing"],
                })

            if len(predictions) < 5:
                continue

            # Direction accuracy
            dir_correct = sum(1 for p in predictions
                              if p["forecast"]["predicted_direction"] != 0
                              and p["actual_dir"] != 0
                              and p["forecast"]["predicted_direction"] == p["actual_dir"])
            dir_total = sum(1 for p in predictions
                            if p["forecast"]["predicted_direction"] != 0 and p["actual_dir"] != 0)
            dir_acc = dir_correct / max(dir_total, 1) * 100

            # Swing capture rate (how many test triggers led to actual swings)
            swing_captures = sum(1 for p in predictions if p["has_swing"])
            swing_rate = swing_captures / max(len(predictions), 1) * 100

            # P&L
            pnl = sum(
                p["forecast"]["predicted_direction"] * p["actual_change"]
                for p in predictions
                if p["forecast"]["predicted_direction"] != 0
            )

            # Train swing rate (how concentrated are swings in this combo?)
            train_swings = sum(1 for r in train_m if r["has_swing"])
            train_swing_rate = train_swings / max(len(train_m), 1) * 100

            horizon_results.append({
                "combo_group": group,
                "filters": filters,
                "train_pool": len(train_m),
                "test_triggers": len(test_m),
                "predictions": len(predictions),
                "direction_accuracy": round(dir_acc, 1),
                "swing_capture_rate": round(swing_rate, 1),
                "train_swing_rate": round(train_swing_rate, 1),
                "total_pnl": round(float(pnl), 1),
                "raw_predictions": predictions,
            })

        horizon_results.sort(key=lambda r: r["direction_accuracy"], reverse=True)
        results_by_horizon[horizon] = {
            "results": horizon_results,
            "baseline_bull_pct": test_bull_pct,
            "baseline_swing_rate": test_swing_rate,
        }

        # Print top results for this horizon
        print(f"\n  Top combos ({label}):")
        print(f"  {'Group':<40} {'Pool':>5} {'Pred':>5} {'Dir%':>5} {'Swing%':>6} {'TrSw%':>6} {'P&L':>8}")
        print(f"  {'-'*80}")
        for r in horizon_results[:10]:
            print(f"  {r['combo_group']:<40} {r['train_pool']:>5} {r['predictions']:>5} "
                  f"{r['direction_accuracy']:>5.1f} {r['swing_capture_rate']:>6.1f} "
                  f"{r['train_swing_rate']:>6.1f} {r['total_pnl']:>+8.1f}")

    return results_by_horizon


# ═══════════════════════════════════════════════════════════════════════
# PHASE 5: STRESS TESTS ON BEST HORIZON
# ═══════════════════════════════════════════════════════════════════════


def stress_test_best(results_by_horizon, all_records):
    """Run stress tests on the horizon with the best results."""
    print("\n\n" + "=" * 70)
    print("PHASE 5: STRESS TESTS")
    print("=" * 70)

    # Find which horizon has the best top-combo accuracy
    best_horizon = None
    best_acc = 0
    for hz, data in results_by_horizon.items():
        if data["results"]:
            top_acc = data["results"][0]["direction_accuracy"]
            if top_acc > best_acc:
                best_acc = top_acc
                best_horizon = hz

    if best_horizon is None:
        print("  No results to stress test.")
        return

    label = HORIZON_LABELS[best_horizon]
    print(f"\n  Testing {label} horizon (best top accuracy: {best_acc:.1f}%)")

    records = all_records[best_horizon]
    test = [r for r in records if r["date"] > TRAIN_END]
    all_test_changes = [r["change_pips"] for r in test]

    hz_data = results_by_horizon[best_horizon]
    top_combos = hz_data["results"][:5]  # Stress test top 5

    for combo_result in top_combos:
        preds = combo_result["raw_predictions"]
        group = combo_result["combo_group"]
        actual_acc = combo_result["direction_accuracy"]
        n = len(preds)

        print(f"\n  [{group}] acc={actual_acc:.1f}% n={n}")

        # 1. PERMUTATION TEST
        shuffled_accs = []
        for _ in range(1000):
            shuf = np.random.choice(all_test_changes, size=n, replace=True)
            correct = 0
            total = 0
            for i, p in enumerate(preds):
                pd_dir = p["forecast"]["predicted_direction"]
                if pd_dir != 0:
                    total += 1
                    shuf_dir = 1 if shuf[i] > 1 else (-1 if shuf[i] < -1 else 0)
                    if shuf_dir != 0 and pd_dir == shuf_dir:
                        correct += 1
            shuffled_accs.append(correct / max(total, 1) * 100)

        p_value = np.mean(np.array(shuffled_accs) >= actual_acc)
        verdict = "REAL EDGE" if p_value < 0.01 else ("LIKELY" if p_value < 0.05 else "NOT SIGNIFICANT")
        print(f"    Permutation: p={p_value:.4f} ({verdict})")

        # 2. BOOTSTRAP CI
        boot_accs = []
        for _ in range(2000):
            idx = np.random.choice(n, size=n, replace=True)
            bp = [preds[i] for i in idx]
            c = sum(1 for p in bp if p["forecast"]["predicted_direction"] != 0
                    and p["actual_dir"] != 0
                    and p["forecast"]["predicted_direction"] == p["actual_dir"])
            t = sum(1 for p in bp if p["forecast"]["predicted_direction"] != 0 and p["actual_dir"] != 0)
            boot_accs.append(c / max(t, 1) * 100)
        ci_lo = np.percentile(boot_accs, 2.5)
        ci_hi = np.percentile(boot_accs, 97.5)
        above_50 = "ABOVE 50%" if ci_lo > 50 else "includes 50%"
        print(f"    Bootstrap CI: [{ci_lo:.1f}%, {ci_hi:.1f}%] ({above_50})")

        # 3. NAIVE BASELINES
        test_bull_pct = sum(1 for p in preds if p["actual_dir"] == 1 and p["actual_dir"] != 0) / max(
            sum(1 for p in preds if p["actual_dir"] != 0), 1) * 100
        always_bull_acc = test_bull_pct
        always_bear_acc = 100 - test_bull_pct
        best_naive = max(always_bull_acc, always_bear_acc)
        edge = actual_acc - best_naive
        print(f"    Naive baseline: always_bull={always_bull_acc:.1f}% always_bear={always_bear_acc:.1f}%")
        print(f"    Edge vs best naive: {edge:+.1f}pp")

        # 4. SWING CONCENTRATION
        swing_in_preds = sum(1 for p in preds if p["has_swing"])
        swing_rate = swing_in_preds / max(n, 1) * 100
        baseline_swing = hz_data["baseline_swing_rate"]
        swing_lift = swing_rate / max(baseline_swing, 0.1)
        print(f"    Swing concentration: {swing_rate:.1f}% (baseline {baseline_swing:.1f}%, "
              f"lift={swing_lift:.1f}x)")


# ═══════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════


def print_cross_horizon_summary(results_by_horizon):
    """Compare results across horizons."""
    print("\n\n" + "=" * 70)
    print("CROSS-HORIZON COMPARISON")
    print("=" * 70)

    for hz in HORIZONS:
        label = HORIZON_LABELS[hz]
        data = results_by_horizon.get(hz, {})
        results = data.get("results", [])
        baseline_bull = data.get("baseline_bull_pct", 50)
        baseline_swing = data.get("baseline_swing_rate", 0)

        if not results:
            print(f"\n  {label}: No results")
            continue

        accs = [r["direction_accuracy"] for r in results]
        swing_rates = [r["swing_capture_rate"] for r in results]
        pnls = [r["total_pnl"] for r in results]

        print(f"\n  {label} HORIZON (baseline bull={baseline_bull:.1f}%, swing={baseline_swing:.1f}%)")
        print(f"    Combos: {len(results)}")
        print(f"    Dir accuracy: {min(accs):.1f}% – {max(accs):.1f}% (mean {np.mean(accs):.1f}%)")
        print(f"    Swing capture: {min(swing_rates):.1f}% – {max(swing_rates):.1f}% "
              f"(mean {np.mean(swing_rates):.1f}%)")
        print(f"    P&L: {sum(pnls):+.1f} total | Profitable: {sum(1 for p in pnls if p > 0)}/{len(pnls)}")

        # Best combo detail
        best = results[0]
        edge_vs_naive = best["direction_accuracy"] - max(baseline_bull, 100 - baseline_bull)
        swing_lift = best["swing_capture_rate"] / max(baseline_swing, 0.1)
        print(f"    Best: [{best['combo_group']}] "
              f"acc={best['direction_accuracy']:.1f}% (edge={edge_vs_naive:+.1f}pp) "
              f"swing={best['swing_capture_rate']:.1f}% ({swing_lift:.1f}x lift)")


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════


def main():
    # Phase 1: Load
    all_records = load_and_tag_swings()

    # Use 4h for swing discovery (most swings visible)
    discovery_hz = "outcome_4h"
    discovery_records = all_records[discovery_hz]
    train_discovery = [r for r in discovery_records if r["date"] <= TRAIN_END]

    print(f"\n  Using {HORIZON_LABELS[discovery_hz]} for combo discovery "
          f"(most swings visible at longer horizon)")

    # Phase 2: Rank
    swing_rankings = rank_swing_predictors(train_discovery)

    # Phase 3: Combos
    combos, tercile_boundaries = discover_swing_combos(train_discovery, swing_rankings)

    # Phase 4: Test across all horizons
    results_by_horizon = test_all_horizons(all_records, combos, tercile_boundaries)

    # Phase 5: Stress test
    stress_test_best(results_by_horizon, all_records)

    # Summary
    print_cross_horizon_summary(results_by_horizon)

    # Save
    output = {
        "config": {"train_end": str(TRAIN_END), "top_n_neighbors": TOP_N_NEIGHBORS,
                    "discovery_horizon": discovery_hz},
        "swing_rankings_top20": swing_rankings[:20],
        "tercile_boundaries": tercile_boundaries,
    }

    for hz in HORIZONS:
        label = HORIZON_LABELS[hz]
        data = results_by_horizon.get(hz, {})
        results = data.get("results", [])
        # Strip raw_predictions from saved output
        output[f"results_{label}"] = [{k: v for k, v in r.items() if k != "raw_predictions"}
                                       for r in results]
        output[f"baseline_{label}"] = {
            "bull_pct": data.get("baseline_bull_pct", 0),
            "swing_rate": data.get("baseline_swing_rate", 0),
        }

    output_path = OUTPUT_DIR / "swing_analysis_results.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
