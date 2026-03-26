"""
Gaussian-Weighted Nearest-Neighbor Analog Engine.

For each query pattern instance, finds the N most similar historical instances
using Euclidean distance with Gaussian weighting, and reports weighted outcome
probabilities.
"""

import numpy as np
import pandas as pd

from forexedge_ict_engine.config import ANALOG_N_NEIGHBORS, ANALOG_SIGMA


def gaussian_weight(distance: float, sigma: float = ANALOG_SIGMA) -> float:
    """Compute Gaussian weight from distance."""
    return np.exp(-0.5 * (distance / sigma) ** 2)


def find_neighbors(
    query: np.ndarray,
    reference_features: np.ndarray,
    n_neighbors: int = ANALOG_N_NEIGHBORS,
) -> tuple:
    """Find N nearest neighbors by Euclidean distance.

    Args:
        query: (D,) feature vector
        reference_features: (M, D) array of reference vectors
        n_neighbors: how many neighbors to return

    Returns:
        (indices, distances) — both arrays of length min(n_neighbors, M)
    """
    diffs = reference_features - query
    distances = np.sqrt(np.sum(diffs ** 2, axis=1))

    n = min(n_neighbors, len(distances))
    sorted_idx = np.argsort(distances)[:n]

    return sorted_idx, distances[sorted_idx]


def predict_outcome(
    query: np.ndarray,
    reference_features: np.ndarray,
    reference_outcomes: pd.DataFrame,
    outcome_col: str,
    n_neighbors: int = ANALOG_N_NEIGHBORS,
    sigma: float = ANALOG_SIGMA,
) -> dict:
    """Predict a binary outcome using Gaussian-weighted neighbors.

    Args:
        query: (D,) feature vector for the query instance
        reference_features: (M, D) normalized feature matrix for training set
        reference_outcomes: DataFrame with outcome columns, aligned with reference_features
        outcome_col: name of the binary outcome column (e.g., "filled")
        n_neighbors: number of neighbors
        sigma: Gaussian bandwidth

    Returns:
        Dict with prediction details.
    """
    indices, distances = find_neighbors(query, reference_features, n_neighbors)

    if len(indices) == 0:
        return {
            "probability": np.nan,
            "n_positive": 0,
            "n_negative": 0,
            "n_neighbors": 0,
            "avg_distance": np.nan,
            "confidence_level": "NONE",
        }

    weights = np.array([gaussian_weight(d, sigma) for d in distances])
    outcomes = reference_outcomes.iloc[indices][outcome_col].values.astype(float)

    # Weighted outcome probability
    weight_sum = weights.sum()
    if weight_sum > 0:
        probability = (weights * outcomes).sum() / weight_sum
    else:
        probability = outcomes.mean()

    n_positive = int(outcomes.sum())
    n_negative = int(len(outcomes) - n_positive)
    avg_distance = float(distances.mean())

    # Confidence level based on avg_distance
    if avg_distance < 0.08:
        confidence = "VERY_HIGH"
    elif avg_distance < 0.12:
        confidence = "HIGH"
    elif avg_distance < 0.15:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return {
        "probability": float(round(probability, 4)),
        "n_positive": n_positive,
        "n_negative": n_negative,
        "n_neighbors": len(indices),
        "avg_distance": round(avg_distance, 6),
        "confidence_level": confidence,
        "distances": distances.tolist(),
        "weights": weights.tolist(),
        "neighbor_indices": indices.tolist(),
    }


def batch_predict(
    query_features: np.ndarray,
    reference_features: np.ndarray,
    reference_outcomes: pd.DataFrame,
    outcome_col: str,
    n_neighbors: int = ANALOG_N_NEIGHBORS,
    sigma: float = ANALOG_SIGMA,
) -> list:
    """Run predictions for multiple query instances.

    Args:
        query_features: (Q, D) normalized feature matrix for query instances
        reference_features: (M, D) normalized feature matrix for training set
        reference_outcomes: DataFrame aligned with reference_features
        outcome_col: binary outcome column name
        n_neighbors: number of neighbors
        sigma: Gaussian bandwidth

    Returns:
        List of prediction dicts (one per query).
    """
    results = []
    for i in range(len(query_features)):
        pred = predict_outcome(
            query_features[i],
            reference_features,
            reference_outcomes,
            outcome_col,
            n_neighbors,
            sigma,
        )
        results.append(pred)

    return results
