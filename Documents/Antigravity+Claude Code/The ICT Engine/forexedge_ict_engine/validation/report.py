"""
Report Generation — validation reports and dashboard-ready signal JSONs.
"""

import json
from datetime import datetime
from pathlib import Path

from forexedge_ict_engine.config import OUTPUT_DIR


def save_validation_report(report: dict, filename: str = None):
    """Save a validation report JSON."""
    reports_dir = OUTPUT_DIR / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    if filename is None:
        concept = report.get("concept", "unknown")
        filename = f"validation_{concept}.json"

    path = reports_dir / filename
    with open(path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"Report saved: {path}")
    return path


def save_detections_csv(detections, filename: str):
    """Save pattern detection results as CSV."""
    det_dir = OUTPUT_DIR / "detections"
    det_dir.mkdir(parents=True, exist_ok=True)

    path = det_dir / filename
    detections.to_csv(path, index=False)
    print(f"Detections saved: {path} ({len(detections):,} rows)")
    return path


def save_predictions_csv(predictions_df, filename: str):
    """Save analog engine predictions as CSV."""
    pred_dir = OUTPUT_DIR / "predictions"
    pred_dir.mkdir(parents=True, exist_ok=True)

    path = pred_dir / filename
    predictions_df.to_csv(path, index=False)
    print(f"Predictions saved: {path} ({len(predictions_df):,} rows)")
    return path


def print_validation_summary(report: dict):
    """Pretty-print a validation report."""
    print(f"\n{'='*60}")
    print(f"CONCEPT: {report.get('concept', 'unknown')}")
    print(f"STATUS:  {report.get('status', 'UNKNOWN')}")
    print(f"{'='*60}")

    if "oos_accuracy" in report:
        print(f"OOS Accuracy:    {report['oos_accuracy']:.1%}")
    if "oos_positive_rr" in report:
        print(f"OOS Positive RR: {report['oos_positive_rr']:.1%}")
    if "oos_signal_count" in report:
        print(f"Signal Count:    {report['oos_signal_count']}")
    if "oos_total_instances" in report:
        print(f"Total Instances: {report['oos_total_instances']}")
    if "fire_rate" in report:
        print(f"Fire Rate:       {report['fire_rate']:.1%}")

    if "year_over_year" in report:
        print(f"\nYear-over-year:")
        for year, data in report["year_over_year"].items():
            print(f"  {year}: {data['accuracy']:.1%} (N={data['count']})")

    if "by_session" in report:
        print(f"\nBy session:")
        for session, data in report["by_session"].items():
            print(f"  {session}: {data['accuracy']:.1%} (N={data['count']})")

    if "stability" in report:
        print(f"\nStability: {report['stability']}")

    print(f"{'='*60}\n")
