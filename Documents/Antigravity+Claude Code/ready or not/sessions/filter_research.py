#!/usr/bin/env python3
"""Filter Research: Identify structural patterns in 5 years of EURUSD data.

Loads all pre-computed session data (9,200 sessions × 123 filters × outcomes),
then systematically tests individual filters and combinations to find which
conditions reliably precede large pip movements.

Output: Categorized filter groups by predicted pip range.
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


# ═══════════════════════════════════════════════════════════════════════
# PHASE 1: LOAD DATA INTO FLAT DATAFRAME
# ═══════════════════════════════════════════════════════════════════════


def load_all_sessions(data_dir="data/vectors"):
    """Load all sessions from parquet stores into a flat DataFrame."""
    print("=" * 70)
    print("PHASE 1: LOADING ALL SESSION DATA")
    print("=" * 70)

    mgr = VectorStoreManager(data_dir)
    mgr.load_all()

    rows = []
    # Only use the 4 main sessions (not overlaps — they lack next-session outcomes)
    main_sessions = ["london", "new_york", "tokyo", "sydney"]

    for session_name in main_sessions:
        store = mgr[session_name]
        print(f"  {session_name}: {len(store)} sessions")

        for i in range(len(store)):
            meta = store._metadata[i]
            outcome = store._outcomes[i]

            if not outcome or not outcome.get("direction"):
                continue

            row = {
                "date": store._dates[i],
                "session": session_name,
                "pair": store._pairs[i],
            }

            # Flatten all metadata (our 123 filters)
            for k, v in meta.items():
                if isinstance(v, dict):
                    for k2, v2 in v.items():
                        row[f"{k}_{k2}"] = v2
                else:
                    row[k] = v

            # Outcome: what happened in the NEXT session
            row["next_direction"] = outcome.get("direction", 0)
            row["next_range_pips"] = outcome.get("range_normalized", 0)
            row["next_continuation_pct"] = outcome.get("continuation_pct", 0)
            row["next_reversal_depth"] = outcome.get("reversal_depth", 0)

            # Compute next-session change in pips (close - open of next session)
            next_open = outcome.get("open", 0)
            next_close = outcome.get("close", 0)
            next_high = outcome.get("high", 0)
            next_low = outcome.get("low", 0)

            if next_open and next_close:
                row["next_change_pips"] = next_close - next_open
                row["next_abs_change_pips"] = abs(next_close - next_open)
                row["next_range_actual_pips"] = next_high - next_low if next_high and next_low else 0
            else:
                row["next_change_pips"] = 0
                row["next_abs_change_pips"] = 0
                row["next_range_actual_pips"] = 0

            rows.append(row)

    df = pd.DataFrame(rows)
    print(f"\n  Total sessions loaded: {len(df)}")
    print(f"  Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"  Columns: {len(df.columns)}")

    return df


# ═══════════════════════════════════════════════════════════════════════
# PHASE 2: IDENTIFY NUMERIC vs CATEGORICAL FILTERS
# ═══════════════════════════════════════════════════════════════════════


# Filters to exclude (not predictive — they describe the outcome itself or are IDs)
EXCLUDE = {
    "date", "session", "pair", "bar_count", "atr",
    "session_ohlc_open", "session_ohlc_high", "session_ohlc_low", "session_ohlc_close",
    "orb_high", "orb_low", "ib_high", "ib_low",
    "next_direction", "next_range_pips", "next_continuation_pct",
    "next_reversal_depth", "next_change_pips", "next_abs_change_pips",
    "next_range_actual_pips",
}

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
    "is_month_end", "is_month_start",
    "prior_ib_break_direction",
}


def identify_filters(df):
    """Separate numeric and categorical filter columns."""
    numeric_filters = []
    categorical_filters = []

    for col in df.columns:
        if col in EXCLUDE:
            continue

        if col in CATEGORICAL:
            categorical_filters.append(col)
            continue

        if df[col].dtype in [np.float64, np.float32, np.int64, np.int32, float, int]:
            # Check it's not constant
            if df[col].nunique() > 1:
                numeric_filters.append(col)
        elif df[col].dtype == object or df[col].dtype == bool:
            if df[col].nunique() > 1:
                categorical_filters.append(col)

    return numeric_filters, categorical_filters


# ═══════════════════════════════════════════════════════════════════════
# PHASE 3: SINGLE FILTER ANALYSIS
# ═══════════════════════════════════════════════════════════════════════


def analyze_single_filters(df, numeric_filters, categorical_filters):
    """Rank each filter by its ability to predict big moves."""
    print("\n" + "=" * 70)
    print("PHASE 2: SINGLE FILTER ANALYSIS")
    print("=" * 70)

    # Define "big move" thresholds (in raw pip values for EURUSD)
    # For EURUSD, 1 pip = 0.0001, so 25 pips = 0.0025
    # But the data stores raw price changes, so we need to check the scale

    # First, understand the scale of our outcome data
    abs_changes = df["next_abs_change_pips"].dropna()
    print(f"\n  Next-session absolute change statistics:")
    print(f"    Mean:   {abs_changes.mean():.6f}")
    print(f"    Median: {abs_changes.median():.6f}")
    print(f"    Std:    {abs_changes.std():.6f}")
    print(f"    P75:    {abs_changes.quantile(0.75):.6f}")
    print(f"    P90:    {abs_changes.quantile(0.90):.6f}")
    print(f"    P95:    {abs_changes.quantile(0.95):.6f}")
    print(f"    Max:    {abs_changes.max():.6f}")

    range_data = df["next_range_actual_pips"].dropna()
    if range_data.mean() > 0:
        print(f"\n  Next-session range statistics:")
        print(f"    Mean:   {range_data.mean():.6f}")
        print(f"    Median: {range_data.median():.6f}")
        print(f"    P75:    {range_data.quantile(0.75):.6f}")
        print(f"    P90:    {range_data.quantile(0.90):.6f}")
        print(f"    Max:    {range_data.max():.6f}")

    # Determine pip scale: if mean change < 0.01, values are in raw price (0.0025 = 25 pips)
    # If mean change > 1, values are already in pip units
    mean_change = abs_changes.mean()
    if mean_change < 0.1:
        pip_multiplier = 10000  # Convert raw EURUSD price diff to pips
        print(f"\n  Scale: raw price differences (×{pip_multiplier} for pips)")
    else:
        pip_multiplier = 1
        print(f"\n  Scale: already in pip units")

    # Define thresholds in pips, convert to data scale
    thresholds_pips = [15, 20, 25, 30, 40, 50]
    thresholds_raw = [t / pip_multiplier for t in thresholds_pips]

    results = []

    # ── Numeric filters ──
    print(f"\n  Analyzing {len(numeric_filters)} numeric filters...")
    for filt in numeric_filters:
        col = df[filt].dropna()
        if len(col) < 100:
            continue

        valid = df.dropna(subset=[filt, "next_abs_change_pips"])
        if len(valid) < 100:
            continue

        # Correlation with next-session magnitude
        corr = valid[filt].corr(valid["next_abs_change_pips"])

        # Split into quartiles and measure mean outcome per quartile
        try:
            valid["quartile"] = pd.qcut(valid[filt], 4, labels=False, duplicates="drop")
        except ValueError:
            continue

        q_outcomes = valid.groupby("quartile")["next_abs_change_pips"].agg(["mean", "count"])

        # Spread: difference between highest and lowest quartile mean outcome
        if len(q_outcomes) >= 2:
            spread = (q_outcomes["mean"].max() - q_outcomes["mean"].min()) * pip_multiplier
        else:
            spread = 0

        # For each big-move threshold, compute hit rate in top vs bottom quartile
        best_threshold_lift = 0
        best_threshold = 0
        for thresh_pips, thresh_raw in zip(thresholds_pips, thresholds_raw):
            big_move = valid["next_abs_change_pips"] >= thresh_raw
            top_q = valid["quartile"] == valid["quartile"].max()
            bot_q = valid["quartile"] == valid["quartile"].min()

            top_rate = big_move[top_q].mean() if top_q.sum() > 0 else 0
            bot_rate = big_move[bot_q].mean() if bot_q.sum() > 0 else 0
            base_rate = big_move.mean()

            if base_rate > 0:
                lift = max(top_rate, bot_rate) / base_rate
                if lift > best_threshold_lift:
                    best_threshold_lift = lift
                    best_threshold = thresh_pips

        results.append({
            "filter": filt,
            "type": "numeric",
            "abs_corr": abs(corr) if not np.isnan(corr) else 0,
            "spread_pips": spread,
            "best_lift": best_threshold_lift,
            "best_threshold": best_threshold,
            "n_valid": len(valid),
        })

    # ── Categorical filters ──
    print(f"  Analyzing {len(categorical_filters)} categorical filters...")
    for filt in categorical_filters:
        valid = df.dropna(subset=["next_abs_change_pips"])
        if filt not in valid.columns:
            continue

        valid_filt = valid[valid[filt].notna()]
        if len(valid_filt) < 100:
            continue

        # Mean outcome by category
        cat_outcomes = valid_filt.groupby(filt)["next_abs_change_pips"].agg(["mean", "count"])
        cat_outcomes = cat_outcomes[cat_outcomes["count"] >= 20]  # Min 20 samples

        if len(cat_outcomes) < 2:
            continue

        spread = (cat_outcomes["mean"].max() - cat_outcomes["mean"].min()) * pip_multiplier

        # Best lift for big moves
        best_lift = 0
        best_thresh = 0
        base_rate_overall = 0
        for thresh_pips, thresh_raw in zip(thresholds_pips, thresholds_raw):
            big_move = valid_filt["next_abs_change_pips"] >= thresh_raw
            base_rate = big_move.mean()
            base_rate_overall = base_rate

            for cat_val in cat_outcomes.index:
                mask = valid_filt[filt] == cat_val
                cat_rate = big_move[mask].mean() if mask.sum() > 0 else 0
                if base_rate > 0:
                    lift = cat_rate / base_rate
                    if lift > best_lift:
                        best_lift = lift
                        best_thresh = thresh_pips

        results.append({
            "filter": filt,
            "type": "categorical",
            "abs_corr": 0,  # N/A for categorical
            "spread_pips": spread,
            "best_lift": best_lift,
            "best_threshold": best_thresh,
            "n_valid": len(valid_filt),
        })

    results_df = pd.DataFrame(results)
    results_df = results_df.sort_values("best_lift", ascending=False)

    # Print top 40
    print(f"\n  TOP 40 FILTERS by Lift (ability to predict big moves):")
    print(f"  {'Rank':>4} {'Filter':<45} {'Type':<12} {'Lift':>6} {'Spread':>8} {'Corr':>6} {'Thresh':>6}")
    print("  " + "-" * 95)
    for i, row in results_df.head(40).iterrows():
        print(f"  {results_df.index.get_loc(i)+1:>4} {row['filter']:<45} {row['type']:<12} "
              f"{row['best_lift']:>6.2f} {row['spread_pips']:>7.1f}p {row['abs_corr']:>6.3f} "
              f"{row['best_threshold']:>5.0f}p")

    return results_df


# ═══════════════════════════════════════════════════════════════════════
# PHASE 4: COMBINATION ANALYSIS
# ═══════════════════════════════════════════════════════════════════════


def discretize_filter(df, filt, n_bins=3):
    """Convert a numeric filter into discrete bins for combination analysis."""
    col = df[filt]
    if col.dtype in [object, bool] or filt in CATEGORICAL:
        return col.astype(str)
    try:
        return pd.qcut(col, n_bins, labels=["low", "mid", "high"], duplicates="drop")
    except (ValueError, TypeError):
        return None


def evaluate_combination(df, filters, pip_multiplier):
    """Evaluate a filter combination's predictive power for big moves."""
    valid = df.dropna(subset=list(filters) + ["next_abs_change_pips"])
    if len(valid) < 50:
        return None

    # Discretize numeric filters
    disc_cols = []
    for f in filters:
        disc = discretize_filter(valid, f)
        if disc is None:
            return None
        disc_cols.append(disc)

    # Create combination key
    combo_key = pd.Series(["_".join(str(x) for x in row) for row in zip(*disc_cols)], index=valid.index)

    # Group by combination and compute outcomes
    grouped = valid.groupby(combo_key)["next_abs_change_pips"].agg(["mean", "count", "std"])
    grouped = grouped[grouped["count"] >= 10]  # Minimum 10 sessions per group

    if len(grouped) < 2:
        return None

    # Find the best and worst groups
    best_group = grouped["mean"].idxmax()
    worst_group = grouped["mean"].idxmin()
    overall_mean = valid["next_abs_change_pips"].mean()

    best_mean_pips = grouped.loc[best_group, "mean"] * pip_multiplier
    best_count = int(grouped.loc[best_group, "count"])
    worst_mean_pips = grouped.loc[worst_group, "mean"] * pip_multiplier
    spread = best_mean_pips - worst_mean_pips

    # Compute big-move hit rates for best group
    best_mask = combo_key == best_group
    thresholds = {15: 15/pip_multiplier, 20: 20/pip_multiplier, 25: 25/pip_multiplier,
                  30: 30/pip_multiplier, 40: 40/pip_multiplier, 50: 50/pip_multiplier}

    hit_rates = {}
    for pips, raw in thresholds.items():
        big = valid["next_abs_change_pips"] >= raw
        best_rate = big[best_mask].mean() if best_mask.sum() > 0 else 0
        base_rate = big.mean()
        hit_rates[pips] = {
            "hit_rate": best_rate,
            "base_rate": base_rate,
            "lift": best_rate / max(base_rate, 0.001),
        }

    return {
        "filters": list(filters),
        "n_filters": len(filters),
        "best_group": best_group,
        "best_mean_pips": best_mean_pips,
        "best_count": best_count,
        "worst_mean_pips": worst_mean_pips,
        "spread_pips": spread,
        "overall_mean_pips": overall_mean * pip_multiplier,
        "hit_rates": hit_rates,
        "n_groups": len(grouped),
    }


def run_combination_analysis(df, single_results, pip_multiplier):
    """Test filter combinations: pairs, triples, and forward-selected groups."""
    print("\n" + "=" * 70)
    print("PHASE 3: COMBINATION ANALYSIS")
    print("=" * 70)

    # Take top 30 filters from single analysis
    top_filters = single_results.head(30)["filter"].tolist()
    print(f"\n  Using top {len(top_filters)} filters for combination analysis")

    all_combos = []

    # ── Test all pairs ──
    print(f"\n  Testing pairs ({len(top_filters)}C2 = {len(top_filters)*(len(top_filters)-1)//2})...")
    pair_count = 0
    for f1, f2 in itertools.combinations(top_filters[:20], 2):  # Top 20 for pairs
        result = evaluate_combination(df, [f1, f2], pip_multiplier)
        if result and result["spread_pips"] > 2:
            all_combos.append(result)
        pair_count += 1
        if pair_count % 50 == 0:
            print(f"    {pair_count} pairs tested...")

    print(f"    {len([c for c in all_combos if c['n_filters']==2])} significant pairs found")

    # ── Test triples (top 15 filters) ──
    top15 = top_filters[:15]
    print(f"\n  Testing triples ({len(top15)}C3 = {len(top15)*(len(top15)-1)*(len(top15)-2)//6})...")
    triple_count = 0
    for f1, f2, f3 in itertools.combinations(top15, 3):
        result = evaluate_combination(df, [f1, f2, f3], pip_multiplier)
        if result and result["spread_pips"] > 3:
            all_combos.append(result)
        triple_count += 1
        if triple_count % 100 == 0:
            print(f"    {triple_count} triples tested...")

    print(f"    {len([c for c in all_combos if c['n_filters']==3])} significant triples found")

    # ── Forward selection for larger groups (5, 10, 15, 20) ──
    print(f"\n  Forward selection for larger groups...")
    for target_size in [5, 7, 10, 15, 20]:
        selected = [top_filters[0]]
        remaining = top_filters[1:25]

        for _ in range(target_size - 1):
            best_score = 0
            best_filt = None

            for f in remaining:
                candidate = selected + [f]
                result = evaluate_combination(df, candidate, pip_multiplier)
                if result and result["spread_pips"] > best_score:
                    best_score = result["spread_pips"]
                    best_filt = f

            if best_filt:
                selected.append(best_filt)
                remaining.remove(best_filt)
            else:
                break

        result = evaluate_combination(df, selected, pip_multiplier)
        if result:
            all_combos.append(result)
            print(f"    Size {target_size}: spread={result['spread_pips']:.1f}p, "
                  f"best_mean={result['best_mean_pips']:.1f}p, "
                  f"best_n={result['best_count']}, filters={selected}")

    return all_combos


# ═══════════════════════════════════════════════════════════════════════
# PHASE 5: CATEGORIZE INTO PIP-RANGE GROUPS
# ═══════════════════════════════════════════════════════════════════════


def categorize_results(all_combos, pip_multiplier):
    """Categorize filter combinations into pip-range groups."""
    print("\n" + "=" * 70)
    print("PHASE 4: CATEGORIZATION INTO PIP-RANGE GROUPS")
    print("=" * 70)

    if not all_combos:
        print("  No significant combinations found!")
        return {}

    # Sort by best_mean_pips
    all_combos.sort(key=lambda x: x["best_mean_pips"], reverse=True)

    # Define pip-range categories
    categories = {
        "TIER_1_MEGA (50+ pips)": {"min": 50, "max": 999, "combos": []},
        "TIER_2_LARGE (30-50 pips)": {"min": 30, "max": 50, "combos": []},
        "TIER_3_MEDIUM (20-30 pips)": {"min": 20, "max": 30, "combos": []},
        "TIER_4_MODERATE (15-20 pips)": {"min": 15, "max": 20, "combos": []},
        "TIER_5_SMALL (10-15 pips)": {"min": 10, "max": 15, "combos": []},
        "TIER_6_MICRO (<10 pips)": {"min": 0, "max": 10, "combos": []},
    }

    for combo in all_combos:
        mean_pips = combo["best_mean_pips"]
        for cat_name, cat_def in categories.items():
            if cat_def["min"] <= mean_pips < cat_def["max"]:
                cat_def["combos"].append(combo)
                break

    # Print results
    for cat_name, cat_def in categories.items():
        combos = cat_def["combos"]
        if not combos:
            print(f"\n  {cat_name}: No combinations found")
            continue

        print(f"\n  {cat_name}: {len(combos)} combinations")
        print(f"  {'='*60}")

        # Show top 5 per category
        for i, combo in enumerate(combos[:5]):
            filters_str = " + ".join(combo["filters"][:5])
            if len(combo["filters"]) > 5:
                filters_str += f" + {len(combo['filters'])-5} more"

            print(f"\n    #{i+1} ({combo['n_filters']} filters):")
            print(f"      Filters: {filters_str}")
            print(f"      Best group mean: {combo['best_mean_pips']:.1f} pips")
            print(f"      Best group count: {combo['best_count']} sessions")
            print(f"      Spread: {combo['spread_pips']:.1f} pips")

            # Print hit rates for this combination
            for pip_thresh in [25, 30, 40, 50]:
                hr = combo["hit_rates"].get(pip_thresh, {})
                if hr:
                    print(f"      {pip_thresh}+ pip hit rate: {hr['hit_rate']*100:.1f}% "
                          f"(base: {hr['base_rate']*100:.1f}%, lift: {hr['lift']:.1f}x)")

    return categories


# ═══════════════════════════════════════════════════════════════════════
# PHASE 6: DEEP DIVE — PRECISE FILTER CONDITIONS
# ═══════════════════════════════════════════════════════════════════════


def deep_dive_best_combos(df, all_combos, pip_multiplier, top_n=10):
    """For the best combinations, find the exact filter values that trigger big moves."""
    print("\n" + "=" * 70)
    print("PHASE 5: DEEP DIVE — EXACT CONDITIONS FOR BIG MOVES")
    print("=" * 70)

    # Sort by spread (predictive separation)
    best = sorted(all_combos, key=lambda x: x["spread_pips"], reverse=True)[:top_n]

    for i, combo in enumerate(best):
        filters = combo["filters"]
        print(f"\n  ── Combo #{i+1}: {' + '.join(filters[:5])}" +
              (f" + {len(filters)-5} more" if len(filters) > 5 else "") + " ──")
        print(f"  Best group: {combo['best_group']}")
        print(f"  Mean outcome: {combo['best_mean_pips']:.1f} pips ({combo['best_count']} sessions)")
        print(f"  Spread: {combo['spread_pips']:.1f} pips over baseline")

        # Decode the best group's filter values
        parts = combo["best_group"].split("_")
        if len(parts) == len(filters):
            print(f"  Conditions:")
            for f, v in zip(filters, parts):
                print(f"    {f} = {v}")

        # Show hit rate ladder
        print(f"  Hit rates:")
        for pips in sorted(combo["hit_rates"].keys()):
            hr = combo["hit_rates"][pips]
            if hr["hit_rate"] > 0:
                print(f"    {pips:>3}+ pips: {hr['hit_rate']*100:5.1f}% "
                      f"(vs base {hr['base_rate']*100:.1f}%, lift {hr['lift']:.1f}x)")


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════


def main():
    print("=" * 70)
    print("FILTER RESEARCH: STRUCTURAL PATTERN IDENTIFICATION")
    print("5 YEARS OF EURUSD DATA × 123 FILTERS")
    print("=" * 70)

    # Phase 1: Load
    df = load_all_sessions(
        str(Path(__file__).parent.parent / "The Engine" / "data" / "vectors")
    )

    if len(df) == 0:
        print("ERROR: No data loaded!")
        return

    # Phase 2: Identify filters
    numeric_filters, categorical_filters = identify_filters(df)
    print(f"\n  Identified {len(numeric_filters)} numeric + {len(categorical_filters)} categorical filters")
    print(f"  = {len(numeric_filters) + len(categorical_filters)} total filterable fields")

    # Determine pip scale
    mean_change = df["next_abs_change_pips"].mean()
    pip_multiplier = 10000 if mean_change < 0.1 else 1

    # Phase 3: Single filter analysis
    single_results = analyze_single_filters(df, numeric_filters, categorical_filters)

    # Phase 4: Combination analysis
    all_combos = run_combination_analysis(df, single_results, pip_multiplier)

    # Phase 5: Categorize
    categories = categorize_results(all_combos, pip_multiplier)

    # Phase 6: Deep dive
    deep_dive_best_combos(df, all_combos, pip_multiplier)

    # Save results
    output_path = Path(__file__).parent / "filter_research_results.json"
    output = {
        "total_sessions": len(df),
        "date_range": [str(df["date"].min()), str(df["date"].max())],
        "pip_multiplier": pip_multiplier,
        "single_filter_rankings": single_results.to_dict("records"),
        "top_combinations": [
            {k: v for k, v in c.items() if k != "hit_rates"}
            for c in sorted(all_combos, key=lambda x: x["spread_pips"], reverse=True)[:50]
        ],
        "categories": {
            name: {
                "count": len(cat["combos"]),
                "top_combo_filters": cat["combos"][0]["filters"] if cat["combos"] else [],
                "top_combo_mean_pips": cat["combos"][0]["best_mean_pips"] if cat["combos"] else 0,
            }
            for name, cat in categories.items()
        },
    }

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n\nResults saved to {output_path}")
    print("=" * 70)
    print("RESEARCH COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
