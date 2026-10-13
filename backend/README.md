# Kuru backend

FastAPI service that stores the collection in SQLite, imports Anki packages and runs the FSRS scheduler.

## Development

```bash
uv sync                      # install dependencies into .venv
uv run kuru serve --reload   # http://127.0.0.1:8000, docs at /docs
uv run pytest                # tests
uv run ruff check && uv run ruff format --check && uv run mypy
```

## Configuration

All settings are environment variables prefixed with `KURU_` (a `.env` file is read too).

| Variable | Default | Description |
| --- | --- | --- |
| `KURU_DATA_DIR` | `data` | Database, media and upload buffer location |
| `KURU_DATABASE_URL` | `sqlite:///<data_dir>/kuru.db` | SQLAlchemy URL |
| `KURU_ACCESS_TOKEN` | *(unset)* | When set, the API requires this token (Bearer header or login cookie) |
| `KURU_CORS_ORIGINS` | `["http://localhost:3000"]` | JSON list of origins allowed to call the API directly |
| `KURU_AUTO_MIGRATE` | `true` | Apply migrations on startup |
| `KURU_MAX_UPLOAD_MB` | `2048` | Maximum import archive size |
| `KURU_DEFAULT_TIMEZONE` | `UTC` | Timezone for the auto-created user |
| `KURU_DAY_ROLLOVER_HOUR` | `4` | Local hour at which a new study day starts |

## Layout

```
src/kuru/
  api/         routers and dependencies (CurrentUser, SessionDep)
  core/        settings, authentication providers, time helpers
  db/          engine, custom column types, migration runner
  models/      SQLModel tables
  schemas/     request / response models
  services/    domain logic (FSRS, importer, scheduler queue, sync, stats)
migrations/    Alembic revisions
```

### Schema changes

```bash
uv run alembic revision --autogenerate -m "describe change"
```

Review the generated file in `migrations/versions/` before committing.
