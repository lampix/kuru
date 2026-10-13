# FSRS scheduling

Kuru schedules with **FSRS-6** ([ADR 0001](adr/0001-fsrs-6.md)) using the official libraries:
[`fsrs`](https://pypi.org/project/fsrs/) on the server and [`ts-fsrs`](https://www.npmjs.com/package/ts-fsrs)
on the client.

## Card states

| Value | State | Meaning |
| --- | --- | --- |
| 0 | New | never studied |
| 1 | Learning | in learning steps |
| 2 | Review | graduated, interval in days |
| 3 | Relearning | lapsed, in relearning steps |

Memory state per card: **stability** (days until retrievability drops to 90 %), **difficulty** (1–10),
due date, last review, step, reps and lapses. Retrievability is computed on demand.

## Parameters (deck presets)

* desired retention (0.70–0.99), maximum interval, learning / relearning steps (minutes), fuzz
* 21 weights `w0 … w20`. Imported FSRS-5 vectors (19 weights) are extended with `w19 = 0` and
  `w20 = 0.5`, which reproduces FSRS-5 exactly; FSRS-4.5 vectors (17) additionally get
  `w17 = w18 = 0`. Values are clamped into the bounds of `py-fsrs`, on both sides.

## Deterministic fuzz

The libraries add random fuzz to review intervals. Because the server replays reviews, random fuzz
would make its result differ from what the device showed. Kuru disables library fuzzing and applies
its own fuzz: the same ranges as FSRS, but the random number comes from `mulberry32(fnv1a("<card id>:<reps>"))`.
The Python (`services/fsrs/fuzz.py`) and TypeScript (`lib/fsrs/fuzz.ts`) implementations are verified
against shared vectors in `shared/test-vectors/fsrs.json`, which also contain full review sequences
used to check that `ts-fsrs` and `py-fsrs` agree.

Regenerate the vectors after changing scheduling code:

```bash
cd backend && uv run python scripts/generate_test_vectors.py
```

## Optimisation

`POST /api/presets/{id}/optimize?apply=true` fits the weights to the review history of all cards using
the preset (≥ 400 reviews) and reschedules them. It needs the optional optimizer dependencies
(PyTorch): `uv sync --extra optimizer`. Without them the endpoint returns `501`.
