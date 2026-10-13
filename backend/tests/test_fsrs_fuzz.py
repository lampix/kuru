"""The vectors below are duplicated in the frontend test-suite to guarantee identical results."""

from kuru.services.fsrs.fuzz import fnv1a, fuzz_interval, fuzz_range, fuzz_seed, mulberry32

FUZZ_VECTORS = [
    # (card_id, reps, interval, maximum_interval, expected)
    (1, 0, 1, 36500, 1),
    (1, 0, 2, 36500, 2),
    (1, 3, 10, 36500, None),
    (42, 7, 100, 36500, None),
    (1234567890123, 12, 365, 36500, None),
    (99, 1, 400, 365, None),
]


def test_fnv1a_known_values() -> None:
    assert fnv1a("") == 0x811C9DC5
    assert fnv1a("a") == 0xE40C292C
    assert fnv1a("foobar") == 0xBF9CF968


def test_mulberry32_is_in_unit_interval_and_deterministic() -> None:
    values = [mulberry32(seed) for seed in range(1000)]
    assert all(0.0 <= v < 1.0 for v in values)
    assert values == [mulberry32(seed) for seed in range(1000)]
    assert len(set(values)) > 990


def test_fuzz_stays_within_range() -> None:
    for card_id, reps, interval, maximum, _ in FUZZ_VECTORS:
        result = fuzz_interval(interval, fuzz_seed(card_id, reps), maximum)
        if interval < 3:
            assert result == interval
        else:
            low, high = fuzz_range(interval, maximum)
            assert low <= result <= high <= maximum


def test_fuzz_range_matches_reference() -> None:
    # py-fsrs: delta = 1 + 0.15*(7-2.5) + 0.1*(20-7) + 0.05*(100-20) = 6.975
    assert fuzz_range(100, 36500) == (93, 107)
    assert fuzz_range(400, 365) == (365, 365)


def test_fuzz_spreads_intervals() -> None:
    results = {fuzz_interval(100, fuzz_seed(card, 0), 36500) for card in range(200)}
    assert len(results) > 10
