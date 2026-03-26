"""
Min-Max Normalizer — fit on train data only, apply to val/OOS.
"""

import json
import numpy as np
from pathlib import Path


class MinMaxNormalizer:
    """Feature normalizer using min-max scaling to [0, 1].

    Critical: fit() on TRAIN data only. transform() on any split.
    """

    def __init__(self):
        self.mins = None
        self.maxs = None
        self.feature_names = None
        self.fitted = False

    def fit(self, features: np.ndarray, feature_names: list = None):
        """Compute min/max from training features.

        Args:
            features: (N, D) array of training feature vectors
            feature_names: optional list of D feature names
        """
        self.mins = np.nanmin(features, axis=0)
        self.maxs = np.nanmax(features, axis=0)
        self.feature_names = feature_names
        self.fitted = True

        # Prevent division by zero for constant features
        ranges = self.maxs - self.mins
        zero_range = ranges == 0
        if zero_range.any():
            self.maxs[zero_range] = self.mins[zero_range] + 1.0

    def transform(self, features: np.ndarray) -> np.ndarray:
        """Normalize features to [0, 1] using stored min/max."""
        if not self.fitted:
            raise RuntimeError("Must call fit() before transform()")

        normalized = (features - self.mins) / (self.maxs - self.mins)
        return np.clip(normalized, 0.0, 1.0)

    def fit_transform(self, features: np.ndarray, feature_names: list = None) -> np.ndarray:
        """Fit on data and return normalized version."""
        self.fit(features, feature_names)
        return self.transform(features)

    def save(self, path: Path):
        """Save normalizer parameters to JSON."""
        data = {
            "mins": self.mins.tolist(),
            "maxs": self.maxs.tolist(),
            "feature_names": self.feature_names,
        }
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def load(self, path: Path):
        """Load normalizer parameters from JSON."""
        with open(path) as f:
            data = json.load(f)
        self.mins = np.array(data["mins"])
        self.maxs = np.array(data["maxs"])
        self.feature_names = data.get("feature_names")
        self.fitted = True
