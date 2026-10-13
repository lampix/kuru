"""Generate test vectors shared between the Python and TypeScript FSRS code.

Run with ``uv run python scripts/generate_test_vectors.py``; the output is committed to
``shared/test-vectors/fsrs.json`` and consumed by both test suites.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from kuru.services.fsrs import FsrsEngine, MemoryState, SchedulingOptions, normalize_weights
from kuru.services.fsrs.fuzz import fnv1a, fuzz_interval, fuzz_seed, mulberry32

OUT = Path(__file__).resolve().parents[2] / "shared" / "test-vectors" / "fsrs.json"
T0 = datetime(2026, 1, 1, 12, tzinfo=UTC)
SEQUENCES = [[3, 3, 3, 3, 3], [4, 4, 4], [1, 3, 3, 1, 3, 3, 4], [2, 2, 3, 1, 1, 3]]


def main() -> None:
    fuzz = []
    for card_id, reps, interval, maximum in [
        (1, 0, 2, 36500),
        (1, 3, 10, 36500),
        (42, 7, 100, 36500),
        (1234567890123, 12, 365, 36500),
        (99, 1, 400, 365),
        (7, 2, 3, 36500),
        (8, 5, 21, 36500),
    ]:
        seed = fuzz_seed(card_id, reps)
        fuzz.append(
            {
                "card_id": card_id,
                "reps": reps,
                "interval": interval,
                "maximum_interval": maximum,
                "seed": seed,
                "random": mulberry32(seed),
                "fuzzed": fuzz_interval(interval, seed, maximum),
            }
        )

    engine = FsrsEngine(SchedulingOptions(weights=normalize_weights(None), enable_fuzz=False))
    sequences = []
    for ratings in SEQUENCES:
        memory = MemoryState(card_id=1)
        at = T0
        steps = []
        for rating in ratings:
            memory = engine.review(memory, rating, at)
            assert memory.due is not None
            steps.append(
                {
                    "rating": rating,
                    "reviewed_at": at.isoformat(),
                    "state": int(memory.state),
                    "stability": memory.stability,
                    "difficulty": memory.difficulty,
                    "due": memory.due.isoformat(),
                }
            )
            at = memory.due
        sequences.append(steps)

    data = {
        "fnv1a": {text: fnv1a(text) for text in ["", "a", "foobar", "1:0", "42:7"]},
        "fuzz": fuzz,
        "sequences": sequences,
        "weights": list(normalize_weights(None)),
    }
    OUT.write_text(json.dumps(data, indent=2) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
