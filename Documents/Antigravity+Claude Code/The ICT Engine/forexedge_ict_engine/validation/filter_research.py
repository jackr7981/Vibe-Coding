"""
Filter Research — discover which contextual filters improve ICT concept outcomes.

For each concept (sweeps, BOS/CHOCH, OBs), tests individual filters and
combos to find subsets where performance exceeds thresholds.

Protocol:
1. Compute all filters on train+val data
2. Test each filter's ability to separate good/bad outcomes
3. Discover best 2-3 filter combos by exhaustive search
4. Validate winning combos on OOS
"""

import warnings
import itertools
import numpy as np
import pandas as pd
from typing import Tuple

from forexedge_ict_engine.config import MIN_SAMPLES_DISCARD


def compute_filter_scores(
    detections: pd.DataFrame,
    outcome_col: str,
    filter_cols: list,
    min_group_size: int = 30,
) -> pd.DataFrame:
    """Score each filter by how well it separates outcomes.

    For categorical filters: compare outcome rate in each category.
    For numeric filters: bin into quintiles, compare outcome rates.

    Returns DataFrame with columns: filter, separation, best_bin, best_bin_rate, worst_bin_rate, lift
    """
    records = []

    for col in filter_cols:
        if col not in detections.columns:
            continue

        values = detections[col]
        outcomes = detections[outcome_col].astype(float)
        baseline = outcomes.mean()

        if values.dtype == object or values.dtype.name == "bool":
            # Categorical
            for val, grp in detections.groupby(col):
                if len(grp) < min_group_size:
                    continue
                rate = grp[outcome_col].astype(float).mean()
                records.append({
                    "filter": col,
                    "condition": f"{col}=={val}",
                    "rate": round(rate, 4),
                    "count": len(grp),
                    "lift": round(rate / baseline, 4) if baseline > 0 else np.nan,
                    "baseline": round(baseline, 4),
                })
        else:
            # Numeric — bin into quintiles
            valid = values.dropna()
            if len(valid) < min_group_size * 3:
                continue

            try:
                bins = pd.qcut(valid, q=5, duplicates="drop")
                for bin_label, grp_idx in valid.groupby(bins).groups.items():
                    grp = detections.loc[grp_idx]
                    if len(grp) < min_group_size:
                        continue
                    rate = grp[outcome_col].astype(float).mean()
                    records.append({
                        "filter": col,
                        "condition": f"{col} in {bin_label}",
                        "rate": round(rate, 4),
                        "count": len(grp),
                        "lift": round(rate / baseline, 4) if baseline > 0 else np.nan,
                        "baseline": round(baseline, 4),
                    })
            except Exception:
                continue

    result = pd.DataFrame(records)
    if len(result) > 0:
        result = result.sort_values("lift", ascending=False)
    return result


def discover_filter_combos(
    detections: pd.DataFrame,
    outcome_col: str,
    filter_cols: list,
    target_rate: float = 0.55,
    min_samples: int = 50,
    max_combo_size: int = 3,
) -> list:
    """Discover filter combinations that push outcome rate above target.

    For numeric filters, creates binary conditions (above/below median, quintile bins).
    Tests all 2-3 way combos, returns those exceeding target.

    Returns list of dicts: {conditions, rate, count, lift}
    """
    baseline = detections[outcome_col].astype(float).mean()

    # Create binary filter conditions
    conditions = {}
    for col in filter_cols:
        if col not in detections.columns:
            continue

        values = detections[col]
        if values.dtype == object or values.dtype.name == "bool":
            for val in values.dropna().unique():
                mask = values == val
                if mask.sum() >= min_samples:
                    conditions[f"{col}=={val}"] = mask
        else:
            valid = values.dropna()
            if len(valid) < min_samples * 2:
                continue
            median = valid.median()
            q25 = valid.quantile(0.25)
            q75 = valid.quantile(0.75)

            above_med = values >= median
            below_med = values < median
            top_q = values >= q75
            bot_q = values <= q25

            if above_med.sum() >= min_samples:
                conditions[f"{col}>=median"] = above_med
            if below_med.sum() >= min_samples:
                conditions[f"{col}<median"] = below_med
            if top_q.sum() >= min_samples:
                conditions[f"{col}>=Q75"] = top_q
            if bot_q.sum() >= min_samples:
                conditions[f"{col}<=Q25"] = bot_q

    # Test individual conditions first
    results = []
    cond_names = list(conditions.keys())

    for name in cond_names:
        mask = conditions[name]
        grp = detections[mask]
        if len(grp) < min_samples:
            continue
        rate = grp[outcome_col].astype(float).mean()
        if rate >= target_rate:
            results.append({
                "conditions": [name],
                "rate": round(rate, 4),
                "count": len(grp),
                "lift": round(rate / baseline, 4) if baseline > 0 else np.nan,
            })

    # Test 2-way combos (limit to top candidates)
    # Pre-filter: only conditions with individual lift > 1.0
    good_conds = [n for n in cond_names
                  if detections[conditions[n]][outcome_col].astype(float).mean() > baseline]
    good_conds = good_conds[:30]  # Limit combinatorial explosion

    for c1, c2 in itertools.combinations(good_conds, 2):
        combo_mask = conditions[c1] & conditions[c2]
        grp = detections[combo_mask]
        if len(grp) < min_samples:
            continue
        rate = grp[outcome_col].astype(float).mean()
        if rate >= target_rate:
            results.append({
                "conditions": [c1, c2],
                "rate": round(rate, 4),
                "count": len(grp),
                "lift": round(rate / baseline, 4) if baseline > 0 else np.nan,
            })

    # Test 3-way combos (only from top 2-way results)
    if max_combo_size >= 3 and len(good_conds) > 3:
        top_2way = [r for r in results if len(r["conditions"]) == 2 and r["rate"] >= target_rate]
        top_2way.sort(key=lambda x: -x["rate"])

        tested_3way = set()
        for combo_2 in top_2way[:20]:
            for c3 in good_conds:
                if c3 in combo_2["conditions"]:
                    continue
                key = tuple(sorted(combo_2["conditions"] + [c3]))
                if key in tested_3way:
                    continue
                tested_3way.add(key)

                combo_mask = conditions[combo_2["conditions"][0]] & conditions[combo_2["conditions"][1]] & conditions[c3]
                grp = detections[combo_mask]
                if len(grp) < min_samples:
                    continue
                rate = grp[outcome_col].astype(float).mean()
                if rate >= target_rate:
                    results.append({
                        "conditions": list(key),
                        "rate": round(rate, 4),
                        "count": len(grp),
                        "lift": round(rate / baseline, 4) if baseline > 0 else np.nan,
                    })

    results.sort(key=lambda x: (-x["rate"], -x["count"]))
    return results


def validate_combo_oos(
    train_detections: pd.DataFrame,
    oos_detections: pd.DataFrame,
    outcome_col: str,
    combo_conditions: list,
    filter_cols: list,
) -> dict:
    """Validate a discovered filter combo on OOS data.

    Recomputes the condition masks on OOS data using the same filter definitions.
    """
    baseline_train = train_detections[outcome_col].astype(float).mean()
    baseline_oos = oos_detections[outcome_col].astype(float).mean()

    # Build condition masks on OOS data
    oos_mask = pd.Series(True, index=oos_detections.index)
    for cond_str in combo_conditions:
        mask = _parse_condition(oos_detections, cond_str, train_detections)
        if mask is not None:
            oos_mask = oos_mask & mask

    filtered = oos_detections[oos_mask]
    if len(filtered) < MIN_SAMPLES_DISCARD:
        return {
            "conditions": combo_conditions,
            "oos_rate": np.nan,
            "oos_count": len(filtered),
            "status": "INSUFFICIENT_SAMPLES",
        }

    oos_rate = filtered[outcome_col].astype(float).mean()

    return {
        "conditions": combo_conditions,
        "oos_rate": round(oos_rate, 4),
        "oos_count": len(filtered),
        "oos_baseline": round(baseline_oos, 4),
        "oos_lift": round(oos_rate / baseline_oos, 4) if baseline_oos > 0 else np.nan,
        "status": "PASS" if oos_rate >= 0.55 else "FAIL",
    }


def _parse_condition(df: pd.DataFrame, cond_str: str, train_df: pd.DataFrame = None) -> pd.Series:
    """Parse a condition string and return a boolean mask on df.

    Supports: col==val, col>=median, col<median, col>=Q75, col<=Q25
    """
    if "==" in cond_str:
        col, val = cond_str.split("==", 1)
        if col in df.columns:
            # Try to match type
            try:
                if df[col].dtype == bool:
                    return df[col] == (val == "True")
                return df[col].astype(str) == val
            except Exception:
                return None
    elif ">=Q75" in cond_str:
        col = cond_str.replace(">=Q75", "")
        if col in df.columns and train_df is not None and col in train_df.columns:
            q75 = train_df[col].quantile(0.75)
            return df[col] >= q75
    elif "<=Q25" in cond_str:
        col = cond_str.replace("<=Q25", "")
        if col in df.columns and train_df is not None and col in train_df.columns:
            q25 = train_df[col].quantile(0.25)
            return df[col] <= q25
    elif ">=median" in cond_str:
        col = cond_str.replace(">=median", "")
        if col in df.columns and train_df is not None and col in train_df.columns:
            med = train_df[col].median()
            return df[col] >= med
    elif "<median" in cond_str:
        col = cond_str.replace("<median", "")
        if col in df.columns and train_df is not None and col in train_df.columns:
            med = train_df[col].median()
            return df[col] < med

    return None
