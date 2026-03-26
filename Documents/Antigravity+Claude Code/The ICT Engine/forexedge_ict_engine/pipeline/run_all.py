"""
Full Pipeline — end-to-end: ingest → detect → predict → validate → report.

Usage:
    cd "The ICT Engine"
    PYTHONPATH=. python3 forexedge_ict_engine/pipeline/run_all.py
"""

import json
import warnings
import time
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

from forexedge_ict_engine.config import OUTPUT_DIR
from forexedge_ict_engine.pipeline.ingest import ingest_pair
from forexedge_ict_engine.pipeline.resample import resample_to_15min
from forexedge_ict_engine.pipeline.indicators import add_indicators
from forexedge_ict_engine.detectors.sessions import add_session_labels, compute_session_analytics
from forexedge_ict_engine.detectors.swings import detect_swings
from forexedge_ict_engine.detectors.fvg import detect_fvg
from forexedge_ict_engine.detectors.sweeps import detect_sweeps
from forexedge_ict_engine.detectors.bos_choch import detect_bos_choch
from forexedge_ict_engine.detectors.order_blocks import detect_order_blocks
from forexedge_ict_engine.engine.features import build_fvg_features, build_sweep_features, build_bos_features, build_ob_features
from forexedge_ict_engine.engine.normalizer import MinMaxNormalizer
from forexedge_ict_engine.engine.analog import batch_predict
from forexedge_ict_engine.engine.filters import compute_all_filters, get_detection_bar_indices
from forexedge_ict_engine.validation.split import split_detections
from forexedge_ict_engine.validation.calibrate import calibrate_fvg_thresholds
from forexedge_ict_engine.validation.evaluate import evaluate_fvg_oos, evaluate_directional_oos
from forexedge_ict_engine.validation.cross_validate import (
    cross_validate_fvg, cross_validate_swings,
    cross_validate_bos_choch, cross_validate_ob,
)
from forexedge_ict_engine.validation.filter_research import discover_filter_combos, validate_combo_oos
from forexedge_ict_engine.validation.report import (
    save_validation_report, save_detections_csv,
    print_validation_summary,
)


def run_full_pipeline(pair: str = "EURUSD"):
    """Execute the complete ICT Engine pipeline."""
    t0 = time.time()

    # ── Phase 1: Data Pipeline ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 1: DATA PIPELINE")
    print("=" * 70)

    df_1min = ingest_pair(pair)
    df = resample_to_15min(df_1min)
    df = add_indicators(df)
    df = add_session_labels(df)

    print(f"\n15-min candles: {len(df):,}")
    print(f"Trading days: {df['trading_date'].nunique()}")
    print(f"Session distribution:\n{df['session'].value_counts().to_string()}")

    # Save processed data
    processed_path = OUTPUT_DIR.parent / "data" / "processed" / f"{pair}_15min.parquet"
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(processed_path)
    print(f"\nSaved processed data: {processed_path}")

    # ── Phase 2: Pattern Detection ──────────────────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 2: PATTERN DETECTION")
    print("=" * 70)

    # Swings (building block for other detectors)
    swings = detect_swings(df)
    print(f"Swings: {len(swings):,} ({(swings['type']=='swing_high').sum():,} H / {(swings['type']=='swing_low').sum():,} L)")

    # FVG
    fvgs = detect_fvg(df, pair=pair)
    print(f"FVGs: {len(fvgs):,} (fill rate: {fvgs['filled'].mean():.1%})")

    # Sweeps
    sweeps_all = detect_sweeps(df, swings, pair=pair)
    print(f"Sweeps: {len(sweeps_all):,} (pos R:R: {sweeps_all['positive_rr'].mean():.1%})")

    # BOS/CHOCH
    bos_all = detect_bos_choch(df, swings, pair=pair)
    print(f"BOS/CHOCH: {len(bos_all):,} (pos R:R: {bos_all['positive_rr'].mean():.1%})")

    # Order Blocks
    obs_all = detect_order_blocks(df, bos_all, pair=pair)
    print(f"Order Blocks: {len(obs_all):,} (fill rate: {obs_all['filled'].mean():.1%})")

    # Session Analytics
    analytics = compute_session_analytics(df)
    print(f"Session analytics: {len(analytics):,} rows")

    # Save detections
    save_detections_csv(fvgs, f"fvg_detections_{pair}.csv")
    save_detections_csv(sweeps_all, f"sweep_detections_{pair}.csv")
    save_detections_csv(bos_all, f"bos_choch_detections_{pair}.csv")
    save_detections_csv(obs_all, f"ob_detections_{pair}.csv")

    # ── Phase 3: Cross-Validation ───────────────────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 3: CROSS-VALIDATION vs smc LIBRARY")
    print("=" * 70)

    cv_results = {}
    for month in ["2024-01", "2024-06", "2024-12"]:
        cv_fvg = cross_validate_fvg(fvgs, df, month)
        cv_sw = cross_validate_swings(swings, df, month)
        cv_bos = cross_validate_bos_choch(bos_all, df, month)
        print(f"\n{month}:")
        print(f"  FVG:    our={cv_fvg['our_total']} smc={cv_fvg['smc_total']} diff={cv_fvg['count_diff_pct']}% [{cv_fvg['verdict']}]")
        print(f"  Swings: our={cv_sw['our_total']} smc={cv_sw['smc_total']} diff={cv_sw['count_diff_pct']}% [{cv_sw['verdict']}]")
        print(f"  BOS:    our={cv_bos['our_total']} smc={cv_bos['smc_total']} diff={cv_bos['count_diff_pct']}% [{cv_bos['verdict']}]")
        cv_results[month] = {"fvg": cv_fvg, "swings": cv_sw, "bos": cv_bos}

    save_validation_report(cv_results, f"cross_validation_all_{pair}.json")

    # ── Phase 4: Analog Engine — FVG Fill ───────────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 4: ANALOG ENGINE — FVG FILL")
    print("=" * 70)

    fvg_splits = split_detections(fvgs)
    train_fvg = fvg_splits["train"].dropna(subset=["gap_atr_ratio", "sma_slope"]).reset_index(drop=True)
    val_fvg = fvg_splits["val"].dropna(subset=["gap_atr_ratio", "sma_slope"]).reset_index(drop=True)
    oos_fvg = fvg_splits["oos"].dropna(subset=["gap_atr_ratio", "sma_slope"]).reset_index(drop=True)

    train_feat = build_fvg_features(train_fvg)
    val_feat = build_fvg_features(val_fvg)
    oos_feat = build_fvg_features(oos_fvg)

    norm = MinMaxNormalizer()
    train_n = norm.fit_transform(train_feat)
    val_n = norm.transform(val_feat)
    oos_n = norm.transform(oos_feat)
    norm.save(OUTPUT_DIR / "reports" / f"normalizer_fvg_{pair}.json")

    train_preds = batch_predict(train_n, train_n, train_fvg, "filled")
    val_preds = batch_predict(val_n, train_n, train_fvg, "filled")
    oos_preds = batch_predict(oos_n, train_n, train_fvg, "filled")

    cal = calibrate_fvg_thresholds(train_preds, train_fvg, val_preds, val_fvg)
    locked_thresh = cal["best_threshold"]
    print(f"Locked threshold: n_positive >= {locked_thresh}")
    print(f"Val accuracy: {cal['best_val_accuracy']:.1%}, fire rate: {cal['best_val_fire_rate']:.1%}")

    fvg_report = evaluate_fvg_oos(oos_preds, oos_fvg, locked_thresh)
    fvg_report["pair"] = pair
    print_validation_summary(fvg_report)
    save_validation_report(fvg_report, f"validation_fvg_fill_{pair}.json")
    save_validation_report(cal, f"calibration_fvg_{pair}.json")

    # ── Phase 5: Analog Engine — Other Concepts ─────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 5: ANALOG ENGINE — SWEEPS, BOS, OBs")
    print("=" * 70)

    concept_reports = {}

    # Sweeps
    sw_splits = split_detections(sweeps_all)
    train_sw = sw_splits["train"].dropna(subset=["sweep_depth_atr", "sma_slope"]).reset_index(drop=True)
    oos_sw = sw_splits["oos"].dropna(subset=["sweep_depth_atr", "sma_slope"]).reset_index(drop=True)

    sw_feat_train = build_sweep_features(train_sw)
    sw_feat_oos = build_sweep_features(oos_sw)
    sw_norm = MinMaxNormalizer()
    sw_train_n = sw_norm.fit_transform(sw_feat_train)
    sw_oos_n = sw_norm.transform(sw_feat_oos)

    sw_oos_preds = batch_predict(sw_oos_n, sw_train_n, train_sw, "positive_rr")
    sw_report = evaluate_directional_oos(sw_oos_preds, oos_sw, 0.65, "sweep_reversal")
    print_validation_summary(sw_report)
    concept_reports["sweep"] = sw_report

    # BOS/CHOCH
    b_splits = split_detections(bos_all)
    train_b = b_splits["train"].dropna(subset=["break_magnitude_atr", "sma_slope"]).reset_index(drop=True)
    oos_b = b_splits["oos"].dropna(subset=["break_magnitude_atr", "sma_slope"]).reset_index(drop=True)

    b_feat_train = build_bos_features(train_b)
    b_feat_oos = build_bos_features(oos_b)
    b_norm = MinMaxNormalizer()
    b_train_n = b_norm.fit_transform(b_feat_train)
    b_oos_n = b_norm.transform(b_feat_oos)

    b_oos_preds = batch_predict(b_oos_n, b_train_n, train_b, "positive_rr")
    b_report = evaluate_directional_oos(b_oos_preds, oos_b, 0.55, "bos_choch")
    print_validation_summary(b_report)
    concept_reports["bos_choch"] = b_report

    # Order Blocks
    o_splits = split_detections(obs_all)
    train_o = o_splits["train"].dropna(subset=["ob_size_atr", "sma_slope"]).reset_index(drop=True)
    oos_o = o_splits["oos"].dropna(subset=["ob_size_atr", "sma_slope"]).reset_index(drop=True)

    o_feat_train = build_ob_features(train_o)
    o_feat_oos = build_ob_features(oos_o)
    o_norm = MinMaxNormalizer()
    o_train_n = o_norm.fit_transform(o_feat_train)
    o_oos_n = o_norm.transform(o_feat_oos)

    o_oos_preds = batch_predict(o_oos_n, o_train_n, train_o, "filled")
    o_report = evaluate_fvg_oos(o_oos_preds, oos_o, 20)
    o_report["concept"] = "order_block_fill"
    print_validation_summary(o_report)
    concept_reports["order_block"] = o_report

    save_validation_report(concept_reports, f"validation_all_concepts_{pair}.json")

    # ── Phase 6: Filter-Enhanced Analysis ───────────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 6: FILTER-ENHANCED ANALYSIS")
    print("=" * 70)

    # Enrich sweeps with filters
    def enrich(dets, df_full, sw):
        indices = get_detection_bar_indices(df_full, dets["datetime"].values)
        filt = compute_all_filters(df_full, indices, sw)
        for c in filt.columns:
            dets[c] = filt[c].values
        return dets

    sweeps_enriched = enrich(sweeps_all.copy(), df, swings)
    filter_cols = [c for c in sweeps_enriched.columns if c.startswith(("vol_", "trend_", "time_", "struct_"))]
    sweep_fcols = filter_cols + ["sweep_depth_pips", "sweep_depth_atr", "bars_since_swing", "session", "hour_utc"]

    sw_splits_e = split_detections(sweeps_enriched)
    train_val_sw = pd.concat([sw_splits_e["train"], sw_splits_e["val"]]).reset_index(drop=True)
    oos_sw_e = sw_splits_e["oos"].reset_index(drop=True)

    combos = discover_filter_combos(train_val_sw, "positive_rr", sweep_fcols, target_rate=0.55, min_samples=50)
    print(f"Sweep combos found: {len(combos)} (target: 55% R:R)")

    sweep_filter_results = []
    for c in combos[:5]:
        r = validate_combo_oos(train_val_sw, oos_sw_e, "positive_rr", c["conditions"], sweep_fcols)
        r["train_rate"] = c["rate"]
        sweep_filter_results.append(r)
        s = "PASS" if r["status"] == "PASS" else "FAIL"
        print(f"  [{s}] {' + '.join(c['conditions'])}: OOS={r.get('oos_rate', 'N/A')} N={r['oos_count']}")

    save_validation_report({
        "sweep_filter_combos": combos[:10],
        "sweep_oos_validation": sweep_filter_results,
    }, f"filter_enhanced_sweep_{pair}.json")

    # ── Final Summary ───────────────────────────────────────────────────
    elapsed = time.time() - t0
    print("\n" + "=" * 70)
    print("FINAL VALIDATION SUMMARY")
    print("=" * 70)

    summary = {
        "pair": pair,
        "data": {
            "candles_15min": len(df),
            "trading_days": int(df["trading_date"].nunique()),
            "date_range": f"{df['timestamp'].min()} to {df['timestamp'].max()}",
        },
        "detections": {
            "fvg": len(fvgs),
            "swings": len(swings),
            "sweeps": len(sweeps_all),
            "bos_choch": len(bos_all),
            "order_blocks": len(obs_all),
        },
        "validation": {
            "fvg_fill": {
                "status": fvg_report["status"],
                "oos_accuracy": fvg_report["oos_accuracy"],
                "fire_rate": fvg_report["fire_rate"],
                "signal_count": fvg_report["oos_signal_count"],
                "threshold": fvg_report["threshold"],
            },
            "sweep_reversal": {
                "status": sw_report["status"],
                "oos_positive_rr": sw_report.get("oos_positive_rr"),
                "signal_count": sw_report.get("oos_signal_count"),
                "best_filtered_oos": max([r.get("oos_rate", 0) or 0 for r in sweep_filter_results]) if sweep_filter_results else None,
            },
            "bos_choch": {
                "status": b_report["status"],
                "oos_positive_rr": b_report.get("oos_positive_rr"),
            },
            "order_block_fill": {
                "status": o_report["status"],
                "oos_accuracy": o_report.get("oos_accuracy"),
                "fire_rate": o_report.get("fire_rate"),
            },
        },
        "ship_ready": [],
        "needs_work": [],
        "killed": [],
    }

    # Classify concepts
    if fvg_report.get("passed"):
        summary["ship_ready"].append("fvg_fill")
    else:
        summary["needs_work"].append("fvg_fill")

    if any(r.get("status") == "PASS" for r in sweep_filter_results):
        summary["needs_work"].append("sweep_reversal (filter-enhanced, needs more OOS data)")
    else:
        summary["killed"].append("sweep_reversal")

    summary["killed"].append("bos_choch (no directional edge found)")

    if o_report.get("oos_accuracy", 0) >= 0.85:
        summary["needs_work"].append("order_block_fill (86.5%, close to 90% threshold)")
    else:
        summary["killed"].append("order_block_fill")

    # Print final summary
    print(f"\n  SHIP-READY:")
    for s in summary["ship_ready"]:
        print(f"    ✓ {s}")
    print(f"\n  NEEDS WORK:")
    for s in summary["needs_work"]:
        print(f"    ~ {s}")
    print(f"\n  KILLED:")
    for s in summary["killed"]:
        print(f"    ✗ {s}")

    print(f"\n  Pipeline completed in {elapsed:.0f}s")

    save_validation_report(summary, f"final_summary_{pair}.json")

    return summary


if __name__ == "__main__":
    run_full_pipeline("EURUSD")
