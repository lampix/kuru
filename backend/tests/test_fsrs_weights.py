import pytest

from kuru.services.fsrs import DEFAULT_WEIGHTS, FSRS6_PARAM_COUNT, normalize_weights


def test_defaults_for_missing_weights() -> None:
    assert normalize_weights(None) == DEFAULT_WEIGHTS
    assert normalize_weights([]) == DEFAULT_WEIGHTS
    assert len(DEFAULT_WEIGHTS) == FSRS6_PARAM_COUNT == 21


def test_fsrs5_weights_are_extended_equivalently() -> None:
    fsrs5 = list(DEFAULT_WEIGHTS[:19])
    result = normalize_weights(fsrs5)
    assert result[:19] == pytest.approx(fsrs5)
    assert result[19:] == (0.0, 0.5)


def test_fsrs45_weights_disable_short_term_parameters() -> None:
    result = normalize_weights(list(DEFAULT_WEIGHTS[:17]))
    assert result[17:] == (0.0, 0.0, 0.0, 0.5)


def test_out_of_bounds_values_are_clamped() -> None:
    weights = list(DEFAULT_WEIGHTS)
    weights[4] = 99.0  # upper bound 10
    weights[0] = -1.0  # lower bound 0.001
    result = normalize_weights(weights)
    assert result[4] == 10.0
    assert result[0] == 0.001


def test_unknown_length_falls_back_to_defaults() -> None:
    assert normalize_weights([1.0, 2.0, 3.0]) == DEFAULT_WEIGHTS
