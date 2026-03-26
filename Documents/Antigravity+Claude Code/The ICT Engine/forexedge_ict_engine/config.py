"""
ForexEdge ICT Engine — Configuration

All parameters, thresholds, session definitions, and split dates.
"""

from pathlib import Path
from datetime import date

# ─── Paths ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
ENGINE_DATA_ROOT = PROJECT_ROOT.parent.parent / "The Engine" / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_DIR = PROJECT_ROOT / "output"

# ─── Pairs ──────────────────────────────────────────────────────────────────
PAIRS = ["EURUSD"]  # MVP — expand later
PIP_MULTIPLIER = {
    "EURUSD": 10_000, "GBPUSD": 10_000, "AUDUSD": 10_000,
    "USDCHF": 10_000, "EURGBP": 10_000, "NZDUSD": 10_000,
    "USDJPY": 100, "EURJPY": 100, "GBPJPY": 100,
}

# ─── Session Definitions (EST hours, HistData native timezone) ──────────────
# HistData uses FIXED EST (UTC-5) year-round — no DST adjustment.
# All hours below are EST. We convert to UTC by adding 5 hours.
SESSIONS_EST = {
    "Tokyo":     {"start_hour": 19, "end_hour": 3},   # 19:00-02:59 EST (prev day 7pm to 3am)
    "London":    {"start_hour": 3,  "end_hour": 8},    # 03:00-07:59 EST
    "New_York":  {"start_hour": 8,  "end_hour": 13},   # 08:00-12:59 EST
    "Overlap":   {"start_hour": 8,  "end_hour": 12},   # 08:00-11:59 EST (London-NY overlap)
    "Off_Hours": {"start_hour": 13, "end_hour": 19},   # 13:00-18:59 EST (low liquidity)
}

# UTC equivalents (EST + 5 hours)
SESSIONS_UTC = {
    "Tokyo":     {"start_hour": 0,  "end_hour": 8},    # 00:00-07:59 UTC
    "London":    {"start_hour": 8,  "end_hour": 13},   # 08:00-12:59 UTC
    "New_York":  {"start_hour": 13, "end_hour": 18},   # 13:00-17:59 UTC
    "Overlap":   {"start_hour": 13, "end_hour": 17},   # 13:00-16:59 UTC
    "Off_Hours": {"start_hour": 18, "end_hour": 0},    # 18:00-23:59 UTC
}

# ─── IS / OOS Split Dates (Non-Negotiable) ──────────────────────────────────
TRAIN_START = date(2021, 1, 1)
TRAIN_END   = date(2022, 12, 31)
VAL_START   = date(2023, 1, 1)
VAL_END     = date(2023, 12, 31)
OOS_START   = date(2024, 1, 1)
# OOS_END is open-ended (all data from 2024 onward)

# ─── Resample ───────────────────────────────────────────────────────────────
RESAMPLE_TF = "15min"
TRADING_DAY_ROLLOVER_HOUR_EST = 17  # Forex day: 17:00 EST to 17:00 EST

# ─── Technical Indicators ───────────────────────────────────────────────────
ATR_PERIOD = 14
SMA_PERIOD = 50
SMA_SLOPE_LOOKBACK = 10  # bars
STDDEV_PERIOD = 14

# ─── Detector Parameters ────────────────────────────────────────────────────
# FVG
FVG_LOOKAHEAD_BARS = 96  # 96 x 15min = 24 hours

# Swings
SWING_LENGTH = 2  # 5-bar fractal (2 bars each side)

# Liquidity Sweeps
SWEEP_SWING_LOOKBACK = 40   # bars to look back for swing points
SWEEP_MIN_DEPTH_PIPS = 0.5  # minimum sweep depth
SWEEP_LOOKAHEAD_BARS = 24   # 24 x 15min = 6 hours

# BOS / CHOCH
BOS_LOOKAHEAD_BARS = 24  # 6 hours

# Order Blocks
OB_LOOKAHEAD_BARS = 96  # 24 hours

# ─── Analog Engine ──────────────────────────────────────────────────────────
ANALOG_N_NEIGHBORS = 20
ANALOG_SIGMA = 0.15  # Gaussian bandwidth
RANGE_POSITION_LOOKBACK = 50  # bars for range position calc

# ─── Signal Thresholds ──────────────────────────────────────────────────────
# Discovered on train+val, locked before OOS
CONFIDENCE_LEVELS = {
    "VERY_HIGH": 0.08,  # avg_distance < 0.08
    "HIGH": 0.08,
    "MEDIUM": 0.15,     # avg_distance 0.08-0.15
    "LOW": 0.15,        # avg_distance > 0.15
}

# ─── Minimum Sample Sizes ──────────────────────────────────────────────────
MIN_SAMPLES_PUBLISH = 100   # Minimum for any published statistic
MIN_SAMPLES_DISCARD = 50    # Below this = discard entirely
# 50-99 = "Low Sample" label, no threshold calibration

# ─── Session Analytics (Kill Zone) ──────────────────────────────────────────
SESSION_IB_BARS = 4  # Initial Balance = first 4 x 15min = 1 hour
