#!/usr/bin/env python3
"""Stress Test: Is the 71-82% direction accuracy real or delusional?

Tests:
  1. PERMUTATION TEST — Shuffle outcomes, re-measure. If shuffled ≈ actual → no edge.
  2. RANDOM COMBO BASELINE — Do random filter combos also get 70%+? If yes → methodology artifact.
  3. TEMPORAL STABILITY — Does accuracy hold across all quarters or one lucky streak?
  4. OVERLAP ANALYSIS — Are 15 combos really independent or all the same sessions?
  5. OPPOSITE DIRECTION — Bet against prediction. Must drop below 50%.
  6. BOOTSTRAP CI — 95% confidence intervals on direction accuracy.
  7. NAIVE BASELINES — Simple rules: "always bull", "same as session trend", "majority of session type".
  8. CLUSTER CHECK — Are correct predictions bunched in time or spread evenly?
  9. VECTOR vs NO-VECTOR — Does the vector search actually help or is filter-only enough?
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

sys.path.insert(0, str(Path(__file__).parent.parent / "The Engine"))

from src.engine.vector_store import VectorStoreManager
from src.engine.similarity import batch_distances

# Import the pipeline functions from the accuracy test
from filter_accuracy_test import (
    load_sessions, discover_combos_from_train, session_matches_group,
    forecast_from_neighbors, TRAIN_END, CATEGORICAL, EXCLUDE, PIP_MULT,
)

np.random.seed(42)


# ═══════════════════════════════════════════════════════════════════════
# DATA SETUP (shared across all tests)
# ═══════════════════════════════════════════════════════════════════════

def setup():
    """Load data, discover combos, build predictions for all combos."""
    data_dir = str(Path(__file__).parent.parent / "The Engine" / "data" / "vectors")
    sessions = load_sessions(data_dir)

    train = sorted([s for s in sessions if s["date"] <= TRAIN_END], key=lambda s: s["date"])
    test = sorted([s for s in sessions if s["date"] > TRAIN_END], key=lambda s: s["date"])

    combos, tercile_boundaries = discover_combos_from_train(train)

    # Build per-combo predictions (need raw predictions for stress tests)
    combo_predictions = {}
    for combo in combos:
        filters = combo["filters"]
        group = combo["best_group"]

        train_matches = [
            s for s in train
            if session_matches_group(s, filters, group, tercile_boundaries)
        ]
        test_matches = [
            s for s in test
            if session_matches_group(s, filters, group, tercile_boundaries)
        ]

        if not train_matches or not test_matches:
            continue

        predictions = []
        for test_s in test_matches:
            forecast = forecast_from_neighbors(test_s, train_matches)
            if forecast is None:
                continue
            predictions.append({
                "date": test_s["date"],
                "session": test_s["session_name"],
                "forecast": forecast,
                "actual_change": test_s["next_change_pips"],
                "actual_abs": test_s["next_abs_change"],
                "actual_dir": 1 if test_s["next_change_pips"] > 0 else -1,
                "test_session": test_s,
            })

        if predictions:
            combo_predictions[group] = {
                "combo": combo,
                "train_matches": train_matches,
                "test_matches": test_matches,
                "predictions": predictions,
            }

    return train, test, combos, tercile_boundaries, combo_predictions


def direction_accuracy(predictions):
    """Compute direction accuracy from predictions list."""
    correct = 0
    total = 0
    for p in predictions:
        pred_dir = p["forecast"]["predicted_direction"]
        if pred_dir != 0:
            total += 1
            if pred_dir == p["actual_dir"]:
                correct += 1
    return correct / max(total, 1) * 100


# ═══════════════════════════════════════════════════════════════════════
# TEST 1: PERMUTATION TEST
# ═══════════════════════════════════════════════════════════════════════

def test_permutation(combo_predictions, test, n_perms=1000):
    """Shuffle outcome-to-session mapping and re-measure accuracy.

    If actual accuracy is within the shuffled distribution → no edge.
    """
    print("\n" + "=" * 80)
    print("TEST 1: PERMUTATION TEST (1000 shuffles)")
    print("  Null hypothesis: filter combos have NO predictive power")
    print("  If actual accuracy > 95th percentile of shuffled → real edge")
    print("=" * 80)

    # Pool all test changes for shuffling
    all_test_changes = [s["next_change_pips"] for s in test]

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        actual_acc = direction_accuracy(preds)
        n_preds = len(preds)

        # Get indices of test sessions used by this combo
        pred_dates = set((p["date"], p["session"]) for p in preds)

        shuffled_accs = []
        for _ in range(n_perms):
            # Shuffle: assign random outcomes from test pool to these prediction slots
            shuffled_changes = np.random.choice(all_test_changes, size=n_preds, replace=True)

            correct = 0
            total = 0
            for i, p in enumerate(preds):
                pred_dir = p["forecast"]["predicted_direction"]
                if pred_dir != 0:
                    total += 1
                    shuffled_dir = 1 if shuffled_changes[i] > 0 else -1
                    if pred_dir == shuffled_dir:
                        correct += 1
            shuffled_accs.append(correct / max(total, 1) * 100)

        shuffled_arr = np.array(shuffled_accs)
        p_value = np.mean(shuffled_arr >= actual_acc)
        p95 = np.percentile(shuffled_arr, 95)
        p99 = np.percentile(shuffled_arr, 99)

        verdict = "REAL EDGE" if p_value < 0.01 else ("LIKELY EDGE" if p_value < 0.05 else "NOT SIGNIFICANT")

        print(f"\n  [{group_name}] (n={n_preds})")
        print(f"    Actual accuracy:    {actual_acc:.1f}%")
        print(f"    Shuffled mean:      {shuffled_arr.mean():.1f}%")
        print(f"    Shuffled 95th pctl: {p95:.1f}%")
        print(f"    Shuffled 99th pctl: {p99:.1f}%")
        print(f"    p-value:            {p_value:.4f}")
        print(f"    VERDICT:            {verdict}")


# ═══════════════════════════════════════════════════════════════════════
# TEST 2: RANDOM COMBO BASELINE
# ═══════════════════════════════════════════════════════════════════════

def test_random_combos(train, test, tercile_boundaries, n_random=100):
    """Generate random filter combos and test them the same way.

    If random combos also get 70%+ → the methodology inflates accuracy.
    """
    print("\n" + "=" * 80)
    print("TEST 2: RANDOM COMBO BASELINE")
    print(f"  Testing {n_random} random filter combos through the same pipeline")
    print("  If random combos also get 70%+ → methodology artifact")
    print("=" * 80)

    # Get all available metadata keys from training data
    sample_meta = train[0]["metadata"]
    numeric_keys = []
    categorical_keys = []
    for k, v in sample_meta.items():
        if k in EXCLUDE or isinstance(v, dict):
            continue
        if k in CATEGORICAL:
            categorical_keys.append(k)
        elif isinstance(v, (int, float)):
            numeric_keys.append(k)

    all_keys = numeric_keys + categorical_keys
    random_accuracies = []

    # Build train DataFrame for combo discovery
    rows = []
    for s in train:
        row = {"next_abs": s["next_abs_change"]}
        for k, v in s["metadata"].items():
            if not isinstance(v, dict):
                row[k] = v
        rows.append(row)
    train_df = pd.DataFrame(rows)

    attempts = 0
    found = 0
    while found < n_random and attempts < n_random * 5:
        attempts += 1
        # Pick 2-3 random filters
        n_filters = np.random.choice([2, 3])
        chosen = list(np.random.choice(all_keys, size=n_filters, replace=False))

        # Evaluate on train to find the best group
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
            index=valid.index
        )
        grouped = valid.groupby(combo_key)["next_abs"].agg(["mean", "count"])
        grouped = grouped[grouped["count"] >= 10]
        if len(grouped) < 2:
            continue

        best_group = grouped["mean"].idxmax()
        best_count = int(grouped.loc[best_group, "count"])
        if best_count < 15:
            continue

        # Now test this random combo the same way as real combos
        combo = {
            "filters": chosen,
            "best_group": best_group,
            "best_mean": float(grouped.loc[best_group, "mean"]),
            "best_count": best_count,
            "spread": float(grouped["mean"].max() - grouped["mean"].min()),
        }

        train_matches = [
            s for s in train
            if session_matches_group(s, chosen, best_group, tercile_boundaries)
        ]
        test_matches = [
            s for s in test
            if session_matches_group(s, chosen, best_group, tercile_boundaries)
        ]

        if len(train_matches) < 3 or len(test_matches) < 5:
            continue

        predictions = []
        for test_s in test_matches:
            forecast = forecast_from_neighbors(test_s, train_matches)
            if forecast is None:
                continue
            predictions.append({
                "date": test_s["date"],
                "session": test_s["session_name"],
                "forecast": forecast,
                "actual_change": test_s["next_change_pips"],
                "actual_abs": test_s["next_abs_change"],
                "actual_dir": 1 if test_s["next_change_pips"] > 0 else -1,
            })

        if len(predictions) < 5:
            continue

        acc = direction_accuracy(predictions)
        random_accuracies.append({"filters": chosen, "group": best_group, "acc": acc,
                                   "n": len(predictions)})
        found += 1

    if not random_accuracies:
        print("  Could not generate any valid random combos.")
        return

    accs = [r["acc"] for r in random_accuracies]
    print(f"\n  Generated {len(random_accuracies)} valid random combos")
    print(f"  Random combo accuracy distribution:")
    print(f"    Mean:   {np.mean(accs):.1f}%")
    print(f"    Median: {np.median(accs):.1f}%")
    print(f"    Std:    {np.std(accs):.1f}%")
    print(f"    Min:    {np.min(accs):.1f}%")
    print(f"    Max:    {np.max(accs):.1f}%")
    print(f"    P25:    {np.percentile(accs, 25):.1f}%")
    print(f"    P75:    {np.percentile(accs, 75):.1f}%")
    print(f"    P95:    {np.percentile(accs, 95):.1f}%")
    print(f"\n  % of random combos above 60%: {np.mean(np.array(accs) > 60) * 100:.1f}%")
    print(f"  % of random combos above 70%: {np.mean(np.array(accs) > 70) * 100:.1f}%")
    print(f"  % of random combos above 75%: {np.mean(np.array(accs) > 75) * 100:.1f}%")
    print(f"  % of random combos above 80%: {np.mean(np.array(accs) > 80) * 100:.1f}%")

    # Show top 5 random combos
    random_accuracies.sort(key=lambda r: r["acc"], reverse=True)
    print(f"\n  Top 5 random combos:")
    for r in random_accuracies[:5]:
        print(f"    {r['acc']:.1f}% (n={r['n']}) filters={r['filters']}")


# ═══════════════════════════════════════════════════════════════════════
# TEST 3: TEMPORAL STABILITY
# ═══════════════════════════════════════════════════════════════════════

def test_temporal_stability(combo_predictions):
    """Check accuracy per quarter. If one quarter drives everything → fragile."""
    print("\n" + "=" * 80)
    print("TEST 3: TEMPORAL STABILITY")
    print("  Accuracy by quarter within the test period")
    print("  If accuracy varies wildly → edge is regime-dependent, not structural")
    print("=" * 80)

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
        overall_acc = direction_accuracy(preds)

        print(f"\n  [{group_name}] overall={overall_acc:.1f}% (n={len(preds)})")
        quarter_accs = []
        for q_name, q_start, q_end in quarters:
            q_preds = [p for p in preds if q_start <= p["date"] <= q_end]
            if not q_preds:
                continue
            q_acc = direction_accuracy(q_preds)
            quarter_accs.append(q_acc)
            bar = "█" * int(q_acc / 5)
            print(f"    {q_name}: {q_acc:5.1f}% (n={len(q_preds):>3})  {bar}")

        if len(quarter_accs) >= 2:
            stability = np.std(quarter_accs)
            min_q = min(quarter_accs)
            print(f"    Stability (std): {stability:.1f}%  Min quarter: {min_q:.1f}%")
            if min_q < 50:
                print(f"    ⚠ WARNING: At least one quarter BELOW 50% — edge not stable")


# ═══════════════════════════════════════════════════════════════════════
# TEST 4: OVERLAP ANALYSIS
# ═══════════════════════════════════════════════════════════════════════

def test_overlap(combo_predictions):
    """How much do the 15 combos overlap? Are they testing the same sessions?"""
    print("\n" + "=" * 80)
    print("TEST 4: OVERLAP ANALYSIS")
    print("  If all combos trigger on the same sessions → only 1 real signal")
    print("=" * 80)

    group_sessions = {}
    for group_name, data in combo_predictions.items():
        dates = set((p["date"], p["session"]) for p in data["predictions"])
        group_sessions[group_name] = dates

    groups = list(group_sessions.keys())
    if len(groups) < 2:
        print("  Only 1 combo — no overlap to check.")
        return

    # Pairwise overlap
    print(f"\n  Unique test sessions per combo:")
    for g in groups:
        print(f"    {g}: {len(group_sessions[g])} sessions")

    # Union of all
    all_sessions = set()
    for dates in group_sessions.values():
        all_sessions |= dates
    print(f"\n  Total unique test sessions across ALL combos: {len(all_sessions)}")

    # Average pairwise overlap
    overlaps = []
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            a = group_sessions[groups[i]]
            b = group_sessions[groups[j]]
            if len(a) == 0 or len(b) == 0:
                continue
            intersection = len(a & b)
            union = len(a | b)
            jaccard = intersection / union * 100
            overlap_pct = intersection / min(len(a), len(b)) * 100
            overlaps.append(overlap_pct)

    if overlaps:
        print(f"\n  Pairwise overlap (% of smaller set shared):")
        print(f"    Mean: {np.mean(overlaps):.1f}%")
        print(f"    Min:  {np.min(overlaps):.1f}%")
        print(f"    Max:  {np.max(overlaps):.1f}%")

        if np.mean(overlaps) > 80:
            print(f"    ⚠ HIGH OVERLAP: These combos are mostly measuring the same signal")
        elif np.mean(overlaps) > 50:
            print(f"    MODERATE OVERLAP: Some redundancy but not entirely the same")
        else:
            print(f"    LOW OVERLAP: Combos are relatively independent")


# ═══════════════════════════════════════════════════════════════════════
# TEST 5: OPPOSITE DIRECTION
# ═══════════════════════════════════════════════════════════════════════

def test_opposite_direction(combo_predictions):
    """If we bet AGAINST every prediction, accuracy should drop below 50%."""
    print("\n" + "=" * 80)
    print("TEST 5: OPPOSITE DIRECTION SANITY CHECK")
    print("  Betting against predictions must give < 50%")
    print("=" * 80)

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        normal_acc = direction_accuracy(preds)

        # Flip predictions
        correct = 0
        total = 0
        for p in preds:
            pred_dir = p["forecast"]["predicted_direction"]
            if pred_dir != 0:
                total += 1
                if -pred_dir == p["actual_dir"]:  # OPPOSITE
                    correct += 1
        opposite_acc = correct / max(total, 1) * 100

        status = "PASS" if opposite_acc < 50 else "FAIL — SUSPICIOUS"
        print(f"  [{group_name}] Normal={normal_acc:.1f}%  Opposite={opposite_acc:.1f}%  "
              f"Sum={normal_acc + opposite_acc:.1f}%  {status}")


# ═══════════════════════════════════════════════════════════════════════
# TEST 6: BOOTSTRAP CI
# ═══════════════════════════════════════════════════════════════════════

def test_bootstrap(combo_predictions, n_bootstrap=2000):
    """Bootstrap 95% confidence intervals on direction accuracy."""
    print("\n" + "=" * 80)
    print(f"TEST 6: BOOTSTRAP CONFIDENCE INTERVALS ({n_bootstrap} resamples)")
    print("  Lower bound of 95% CI is the 'real' minimum accuracy estimate")
    print("=" * 80)

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        n = len(preds)
        actual_acc = direction_accuracy(preds)

        # Bootstrap
        boot_accs = []
        for _ in range(n_bootstrap):
            boot_idx = np.random.choice(n, size=n, replace=True)
            boot_preds = [preds[i] for i in boot_idx]
            boot_accs.append(direction_accuracy(boot_preds))

        boot_arr = np.array(boot_accs)
        ci_lo = np.percentile(boot_arr, 2.5)
        ci_hi = np.percentile(boot_arr, 97.5)

        print(f"  [{group_name}] (n={n})")
        print(f"    Point estimate: {actual_acc:.1f}%")
        print(f"    95% CI:         [{ci_lo:.1f}%, {ci_hi:.1f}%]")
        above_50 = "above 50%" if ci_lo > 50 else "INCLUDES 50% — NOT RELIABLE"
        print(f"    Lower bound {above_50}")


# ═══════════════════════════════════════════════════════════════════════
# TEST 7: NAIVE BASELINES
# ═══════════════════════════════════════════════════════════════════════

def test_naive_baselines(combo_predictions, train, test):
    """Compare against simple naive strategies.

    Naive 1: Always predict bullish
    Naive 2: Predict majority direction of the training data
    Naive 3: Predict majority direction for this session type in training
    Naive 4: Filter-only (no vector search) — just use train mean direction
    """
    print("\n" + "=" * 80)
    print("TEST 7: NAIVE BASELINES")
    print("  Our edge must beat these simple strategies")
    print("=" * 80)

    # Train-wide direction stats
    train_changes = [s["next_change_pips"] for s in train]
    train_bull_pct = sum(1 for c in train_changes if c > 0) / len(train_changes) * 100
    train_majority = 1 if train_bull_pct > 50 else -1

    # Per-session-type direction in training
    session_majority = {}
    for stype in ["london", "new_york", "tokyo", "sydney"]:
        s_changes = [s["next_change_pips"] for s in train if s["session_name"] == stype]
        if s_changes:
            bull = sum(1 for c in s_changes if c > 0) / len(s_changes)
            session_majority[stype] = 1 if bull > 0.5 else -1

    print(f"\n  Training data bias: {train_bull_pct:.1f}% bullish → majority = {'BULL' if train_majority == 1 else 'BEAR'}")
    for stype, d in session_majority.items():
        print(f"    {stype}: majority = {'BULL' if d == 1 else 'BEAR'}")

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        n = len(preds)
        actual_acc = direction_accuracy(preds)

        # Naive 1: always bull
        always_bull = sum(1 for p in preds if p["actual_dir"] == 1) / n * 100

        # Naive 2: training majority
        train_maj_acc = sum(1 for p in preds if p["actual_dir"] == train_majority) / n * 100

        # Naive 3: session-type majority
        session_correct = 0
        for p in preds:
            s_maj = session_majority.get(p["session"], train_majority)
            if p["actual_dir"] == s_maj:
                session_correct += 1
        session_acc = session_correct / n * 100

        # Naive 4: filter-only (no vector search, just majority of ALL train matches)
        train_matches = data["train_matches"]
        tm_changes = [s["next_change_pips"] for s in train_matches]
        tm_bull_pct = sum(1 for c in tm_changes if c > 0) / max(len(tm_changes), 1)
        filter_majority = 1 if tm_bull_pct > 0.5 else -1
        filter_only_acc = sum(1 for p in preds if p["actual_dir"] == filter_majority) / n * 100

        edge_vs_best_naive = actual_acc - max(always_bull, train_maj_acc, session_acc, filter_only_acc)

        print(f"\n  [{group_name}] (n={n})")
        print(f"    Our model:        {actual_acc:5.1f}%")
        print(f"    Always bull:      {always_bull:5.1f}%")
        print(f"    Train majority:   {train_maj_acc:5.1f}%")
        print(f"    Session majority: {session_acc:5.1f}%")
        print(f"    Filter-only:      {filter_only_acc:5.1f}%  (train pool majority, no vector search)")
        print(f"    Edge vs best:     {edge_vs_best_naive:+.1f}pp")

        if edge_vs_best_naive < 5:
            print(f"    ⚠ WARNING: Edge over naive baselines is thin ({edge_vs_best_naive:+.1f}pp)")


# ═══════════════════════════════════════════════════════════════════════
# TEST 8: TEMPORAL CLUSTERING
# ═══════════════════════════════════════════════════════════════════════

def test_clustering(combo_predictions):
    """Are correct predictions clustered in time or spread evenly?"""
    print("\n" + "=" * 80)
    print("TEST 8: TEMPORAL CLUSTERING")
    print("  If wins cluster in one period → regime luck, not structural edge")
    print("=" * 80)

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        preds_sorted = sorted(preds, key=lambda p: p["date"])

        # Create binary sequence: 1 = correct, 0 = wrong
        sequence = []
        for p in preds_sorted:
            pred_dir = p["forecast"]["predicted_direction"]
            if pred_dir != 0:
                sequence.append(1 if pred_dir == p["actual_dir"] else 0)

        if len(sequence) < 10:
            continue

        seq = np.array(sequence)

        # Runs test: count consecutive runs of wins/losses
        n_runs = 1
        for i in range(1, len(seq)):
            if seq[i] != seq[i - 1]:
                n_runs += 1

        n1 = np.sum(seq)  # wins
        n0 = len(seq) - n1  # losses
        # Expected runs under independence
        if n0 == 0 or n1 == 0:
            continue
        expected_runs = 1 + (2 * n0 * n1) / (n0 + n1)
        variance_runs = (2 * n0 * n1 * (2 * n0 * n1 - n0 - n1)) / ((n0 + n1) ** 2 * (n0 + n1 - 1))
        if variance_runs <= 0:
            continue
        z_runs = (n_runs - expected_runs) / np.sqrt(variance_runs)

        # Rolling 20-prediction accuracy
        window = min(20, len(seq) // 3)
        if window >= 5:
            rolling = [np.mean(seq[max(0, i - window):i]) * 100 for i in range(window, len(seq))]
            rolling_min = np.min(rolling)
            rolling_max = np.max(rolling)
            rolling_std = np.std(rolling)
        else:
            rolling_min = rolling_max = rolling_std = 0

        print(f"\n  [{group_name}] (n={len(seq)})")
        print(f"    Runs test: {n_runs} runs (expected {expected_runs:.1f}), z={z_runs:.2f}")
        if abs(z_runs) > 1.96:
            if z_runs < -1.96:
                print(f"    ⚠ SIGNIFICANT CLUSTERING (z={z_runs:.2f}) — wins/losses are bunched")
            else:
                print(f"    Significant ALTERNATION (z={z_runs:.2f}) — anti-clustering")
        else:
            print(f"    No significant clustering — wins spread randomly (good)")

        if window >= 5:
            print(f"    Rolling {window}-prediction accuracy: min={rolling_min:.0f}%, "
                  f"max={rolling_max:.0f}%, std={rolling_std:.1f}%")


# ═══════════════════════════════════════════════════════════════════════
# TEST 9: VECTOR SEARCH VALUE-ADD
# ═══════════════════════════════════════════════════════════════════════

def test_vector_vs_no_vector(combo_predictions):
    """Does vector-based neighbor search add value over just using filter matches?

    Compare: (A) weighted-by-distance forecast vs (B) equal-weight all train matches.
    """
    print("\n" + "=" * 80)
    print("TEST 9: VECTOR SEARCH VALUE-ADD")
    print("  Does finding closest vectors help or is filter matching enough?")
    print("=" * 80)

    for group_name, data in combo_predictions.items():
        preds = data["predictions"]
        train_matches = data["train_matches"]

        # Method A: Our pipeline (vector-weighted top-N)
        vector_acc = direction_accuracy(preds)

        # Method B: Equal-weight ALL train matches (no vector search)
        all_train_changes = [s["next_change_pips"] for s in train_matches]
        mean_change = np.mean(all_train_changes)
        flat_dir = 1 if mean_change > 0 else (-1 if mean_change < 0 else 0)

        flat_correct = 0
        flat_total = 0
        for p in preds:
            if flat_dir != 0:
                flat_total += 1
                if flat_dir == p["actual_dir"]:
                    flat_correct += 1
        flat_acc = flat_correct / max(flat_total, 1) * 100

        # Method C: Random subset of 30 train matches (no distance weighting)
        random_accs = []
        for _ in range(100):
            if len(train_matches) <= 30:
                subset = train_matches
            else:
                idx = np.random.choice(len(train_matches), size=30, replace=False)
                subset = [train_matches[i] for i in idx]

            sub_changes = [s["next_change_pips"] for s in subset]
            sub_mean = np.mean(sub_changes)
            sub_dir = 1 if sub_mean > 0 else (-1 if sub_mean < 0 else 0)

            correct = sum(1 for p in preds if sub_dir != 0 and sub_dir == p["actual_dir"])
            total = len(preds) if sub_dir != 0 else 0
            random_accs.append(correct / max(total, 1) * 100)

        rand_mean_acc = np.mean(random_accs)

        vector_edge = vector_acc - max(flat_acc, rand_mean_acc)

        print(f"\n  [{group_name}] (n={len(preds)}, pool={len(train_matches)})")
        print(f"    Vector-weighted (ours): {vector_acc:5.1f}%")
        print(f"    Flat all-matches:       {flat_acc:5.1f}%")
        print(f"    Random-30 mean:         {rand_mean_acc:5.1f}%")
        print(f"    Vector edge:            {vector_edge:+.1f}pp")


# ═══════════════════════════════════════════════════════════════════════
# FINAL VERDICT
# ═══════════════════════════════════════════════════════════════════════

def final_verdict(combo_predictions):
    """Summarize across all tests."""
    print("\n" + "=" * 80)
    print("FINAL STRESS TEST SUMMARY")
    print("=" * 80)

    total_preds = sum(len(d["predictions"]) for d in combo_predictions.values())
    accs = [direction_accuracy(d["predictions"]) for d in combo_predictions.values()]

    print(f"\n  Total combos tested: {len(combo_predictions)}")
    print(f"  Total predictions:   {total_preds}")
    print(f"  Accuracy range:      {min(accs):.1f}% – {max(accs):.1f}%")
    print(f"  Mean accuracy:       {np.mean(accs):.1f}%")


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    print("=" * 80)
    print("STRESS TEST: IS THE EDGE REAL OR ARE WE DELUSIONAL?")
    print("=" * 80)

    train, test, combos, tercile_boundaries, combo_predictions = setup()
    print(f"\n  Setup complete: {len(combo_predictions)} combos with predictions")

    # Run all tests
    test_permutation(combo_predictions, test, n_perms=1000)
    test_random_combos(train, test, tercile_boundaries, n_random=100)
    test_temporal_stability(combo_predictions)
    test_overlap(combo_predictions)
    test_opposite_direction(combo_predictions)
    test_bootstrap(combo_predictions, n_bootstrap=2000)
    test_naive_baselines(combo_predictions, train, test)
    test_clustering(combo_predictions)
    test_vector_vs_no_vector(combo_predictions)
    final_verdict(combo_predictions)


if __name__ == "__main__":
    main()
