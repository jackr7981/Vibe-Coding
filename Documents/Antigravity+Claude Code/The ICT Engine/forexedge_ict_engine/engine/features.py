"""
Feature Vector Construction — per pattern type.

Each pattern type has a specific feature vector for analog engine comparison.
"""

import numpy as np
import pandas as pd


# Session encoding: map session names to numeric values for feature vectors
SESSION_ENCODING = {
    "Tokyo": 0.0,
    "London": 0.33,
    "New_York": 0.67,
    "Off_Hours": 1.0,
}

FVG_FEATURE_NAMES = [
    "gap_atr_ratio", "hour_norm", "sma_slope_norm",
    "range_position", "type_binary", "session_norm",
]

SWEEP_FEATURE_NAMES = [
    "sweep_depth_atr", "hour_norm", "sma_slope_norm",
    "bars_since_swing_norm", "type_binary", "session_norm",
]

BOS_FEATURE_NAMES = [
    "break_magnitude_atr", "hour_norm", "sma_slope_norm",
    "trend_duration_norm", "type_encoded", "session_norm",
]

OB_FEATURE_NAMES = [
    "ob_size_atr", "hour_norm", "sma_slope_norm",
    "range_position", "trigger_type_binary", "session_norm",
]


def build_fvg_features(fvgs: pd.DataFrame) -> np.ndarray:
    """Build feature vectors for FVG instances.

    Features: [gap_atr_ratio, hour_norm, sma_slope, range_position, type_binary, session_norm]
    Normalization is done separately by MinMaxNormalizer.

    Returns: (N, 6) array of raw feature values.
    """
    features = np.column_stack([
        fvgs["gap_atr_ratio"].fillna(0).values,
        fvgs["hour_utc"].values / 23.0,  # Normalize hour to [0, 1]
        fvgs["sma_slope"].fillna(0).values,
        fvgs["range_position"].values,
        (fvgs["type"] == "bullish").astype(float).values,
        fvgs["session"].map(SESSION_ENCODING).fillna(0.5).values,
    ])
    return features


def build_sweep_features(sweeps: pd.DataFrame) -> np.ndarray:
    """Build feature vectors for liquidity sweep instances."""
    features = np.column_stack([
        sweeps["sweep_depth_atr"].fillna(0).values,
        sweeps["hour_utc"].values / 23.0,
        sweeps["sma_slope"].fillna(0).values,
        sweeps["bars_since_swing"].fillna(0).values,
        (sweeps["type"] == "sellside_sweep").astype(float).values,
        sweeps["session"].map(SESSION_ENCODING).fillna(0.5).values,
    ])
    return features


def build_bos_features(bos: pd.DataFrame) -> np.ndarray:
    """Build feature vectors for BOS/CHOCH instances."""
    type_map = {
        "bullish_bos": 0.0, "bearish_bos": 0.25,
        "bullish_choch": 0.75, "bearish_choch": 1.0,
    }
    features = np.column_stack([
        bos["break_magnitude_atr"].fillna(0).values,
        bos["hour_utc"].values / 23.0,
        bos["sma_slope"].fillna(0).values,
        bos["trend_duration"].fillna(0).values,
        bos["type"].map(type_map).fillna(0.5).values,
        bos["session"].map(SESSION_ENCODING).fillna(0.5).values,
    ])
    return features


def build_ob_features(obs: pd.DataFrame) -> np.ndarray:
    """Build feature vectors for order block instances."""
    features = np.column_stack([
        obs["ob_size_atr"].fillna(0).values,
        obs["hour_utc"].values / 23.0,
        obs["sma_slope"].fillna(0).values,
        obs["range_position"].fillna(0.5).values,
        (obs["trigger_event"] == "choch").astype(float).values,
        obs["session"].map(SESSION_ENCODING).fillna(0.5).values,
    ])
    return features
