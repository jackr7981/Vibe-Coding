"""
Cross-Validation with smartmoneyconcepts library.

Compares our custom detectors against the smc library on 1-month samples
to verify consistency. This is a validation tool, not a production dependency.
"""

import numpy as np
import pandas as pd
from smartmoneyconcepts import smc


def cross_validate_fvg(our_fvgs: pd.DataFrame, ohlc_15min: pd.DataFrame, sample_month: str = "2024-01") -> dict:
    """Compare our FVG detector with smc.fvg() on a 1-month sample.

    Args:
        our_fvgs: Output from our detect_fvg()
        ohlc_15min: Full 15-min DataFrame (needs timestamp, open, high, low, close)
        sample_month: Month to test (format: "YYYY-MM")

    Returns:
        Comparison report dict.
    """
    # Filter to sample month
    year, month = sample_month.split("-")
    mask = (
        (ohlc_15min["timestamp"].dt.year == int(year)) &
        (ohlc_15min["timestamp"].dt.month == int(month))
    )
    sample = ohlc_15min[mask].copy()
    if len(sample) == 0:
        return {"error": f"No data for {sample_month}"}

    # Our detections in this month
    our_month = our_fvgs[
        (pd.to_datetime(our_fvgs["datetime"]).dt.year == int(year)) &
        (pd.to_datetime(our_fvgs["datetime"]).dt.month == int(month))
    ]

    # smc library detection
    smc_input = sample[["open", "high", "low", "close"]].copy()
    smc_input.index = sample["timestamp"]
    smc_result = smc.fvg(smc_input)

    smc_bullish = (smc_result["FVG"] == 1).sum()
    smc_bearish = (smc_result["FVG"] == -1).sum()
    smc_total = smc_bullish + smc_bearish

    our_bullish = (our_month["type"] == "bullish").sum()
    our_bearish = (our_month["type"] == "bearish").sum()
    our_total = len(our_month)

    # Count difference
    if max(smc_total, our_total) > 0:
        count_diff_pct = abs(smc_total - our_total) / max(smc_total, our_total) * 100
    else:
        count_diff_pct = 0

    if count_diff_pct <= 5:
        verdict = "PASS"
    elif count_diff_pct <= 15:
        verdict = "INVESTIGATE"
    else:
        verdict = "FAIL"

    return {
        "sample_month": sample_month,
        "sample_bars": len(sample),
        "our_total": int(our_total),
        "our_bullish": int(our_bullish),
        "our_bearish": int(our_bearish),
        "smc_total": int(smc_total),
        "smc_bullish": int(smc_bullish),
        "smc_bearish": int(smc_bearish),
        "count_diff_pct": round(count_diff_pct, 1),
        "verdict": verdict,
    }


def cross_validate_swings(our_swings: pd.DataFrame, ohlc_15min: pd.DataFrame, sample_month: str = "2024-01") -> dict:
    """Compare our swing detector with smc.swing_highs_lows()."""
    year, month = sample_month.split("-")
    mask = (
        (ohlc_15min["timestamp"].dt.year == int(year)) &
        (ohlc_15min["timestamp"].dt.month == int(month))
    )
    sample = ohlc_15min[mask].copy()
    if len(sample) == 0:
        return {"error": f"No data for {sample_month}"}

    # smc library detection (swing_length=2 to match our 5-bar fractal)
    smc_input = sample[["open", "high", "low", "close"]].copy()
    smc_input.index = sample["timestamp"]
    smc_result = smc.swing_highs_lows(smc_input, swing_length=2)

    smc_highs = (smc_result["HighLow"] == 1).sum()
    smc_lows = (smc_result["HighLow"] == -1).sum()
    smc_total = smc_highs + smc_lows

    our_month = our_swings[
        (pd.to_datetime(our_swings["datetime"]).dt.year == int(year)) &
        (pd.to_datetime(our_swings["datetime"]).dt.month == int(month))
    ]
    our_highs = (our_month["type"] == "swing_high").sum()
    our_lows = (our_month["type"] == "swing_low").sum()
    our_total = len(our_month)

    count_diff_pct = abs(smc_total - our_total) / max(smc_total, our_total) * 100 if max(smc_total, our_total) > 0 else 0

    return {
        "sample_month": sample_month,
        "our_total": int(our_total),
        "our_highs": int(our_highs),
        "our_lows": int(our_lows),
        "smc_total": int(smc_total),
        "smc_highs": int(smc_highs),
        "smc_lows": int(smc_lows),
        "count_diff_pct": round(count_diff_pct, 1),
        "verdict": "PASS" if count_diff_pct <= 5 else ("INVESTIGATE" if count_diff_pct <= 15 else "FAIL"),
    }


def cross_validate_bos_choch(our_bos: pd.DataFrame, ohlc_15min: pd.DataFrame, sample_month: str = "2024-01") -> dict:
    """Compare our BOS/CHOCH detector with smc.bos_choch()."""
    year, month = sample_month.split("-")
    mask = (
        (ohlc_15min["timestamp"].dt.year == int(year)) &
        (ohlc_15min["timestamp"].dt.month == int(month))
    )
    sample = ohlc_15min[mask].copy()
    if len(sample) == 0:
        return {"error": f"No data for {sample_month}"}

    smc_input = sample[["open", "high", "low", "close"]].copy()
    smc_input.index = sample["timestamp"]
    smc_swings = smc.swing_highs_lows(smc_input, swing_length=2)
    smc_result = smc.bos_choch(smc_input, smc_swings, close_break=True)

    smc_bos = smc_result["BOS"].notna().sum()
    smc_choch = smc_result["CHOCH"].notna().sum()
    smc_total = smc_bos + smc_choch

    our_month = our_bos[
        (pd.to_datetime(our_bos["datetime"]).dt.year == int(year)) &
        (pd.to_datetime(our_bos["datetime"]).dt.month == int(month))
    ]
    our_bos_count = our_month["type"].str.contains("bos").sum()
    our_choch_count = our_month["type"].str.contains("choch").sum()
    our_total = len(our_month)

    count_diff_pct = abs(smc_total - our_total) / max(smc_total, our_total) * 100 if max(smc_total, our_total) > 0 else 0

    return {
        "sample_month": sample_month,
        "our_total": int(our_total),
        "our_bos": int(our_bos_count),
        "our_choch": int(our_choch_count),
        "smc_total": int(smc_total),
        "smc_bos": int(smc_bos),
        "smc_choch": int(smc_choch),
        "count_diff_pct": round(count_diff_pct, 1),
        "verdict": "PASS" if count_diff_pct <= 5 else ("INVESTIGATE" if count_diff_pct <= 15 else "FAIL"),
    }


def cross_validate_ob(our_obs: pd.DataFrame, ohlc_15min: pd.DataFrame, sample_month: str = "2024-01") -> dict:
    """Compare our OB detector with smc.ob()."""
    year, month = sample_month.split("-")
    mask = (
        (ohlc_15min["timestamp"].dt.year == int(year)) &
        (ohlc_15min["timestamp"].dt.month == int(month))
    )
    sample = ohlc_15min[mask].copy()
    if len(sample) == 0:
        return {"error": f"No data for {sample_month}"}

    smc_input = sample[["open", "high", "low", "close", "volume"]].copy()
    smc_input.index = sample["timestamp"]
    smc_swings = smc.swing_highs_lows(smc_input, swing_length=2)
    smc_result = smc.ob(smc_input, smc_swings)

    smc_bullish = (smc_result["OB"] == 1).sum()
    smc_bearish = (smc_result["OB"] == -1).sum()
    smc_total = smc_bullish + smc_bearish

    our_month = our_obs[
        (pd.to_datetime(our_obs["datetime"]).dt.year == int(year)) &
        (pd.to_datetime(our_obs["datetime"]).dt.month == int(month))
    ]
    our_total = len(our_month)

    count_diff_pct = abs(smc_total - our_total) / max(smc_total, our_total) * 100 if max(smc_total, our_total) > 0 else 0

    return {
        "sample_month": sample_month,
        "our_total": int(our_total),
        "smc_total": int(smc_total),
        "count_diff_pct": round(count_diff_pct, 1),
        "verdict": "PASS" if count_diff_pct <= 5 else ("INVESTIGATE" if count_diff_pct <= 15 else "FAIL"),
        "note": "Divergence expected: our OBs tied to BOS/CHOCH events, smc uses volume-based definition",
    }
