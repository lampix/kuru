# Deployment

## Docker Compose (recommended)

```bash
cp .env.example .env    # optional: port, access token, timezone, upload limit
docker compose up -d --build
```

* `frontend` (Next.js standalone server) listens on `KURU_PORT` (default 3000) and proxies `/api/*`
  to `backend`, which is not published.
* Data — the SQLite database and media — lives in the `kuru-data` volume (`/data` in the backend).

### Configuration

| Variable (`.env`) | Default | Purpose |
| --- | --- | --- |
| `KURU_PORT` | `3000` | published port |
| `KURU_ACCESS_TOKEN` | *(empty)* | require this token to sign in |
| `KURU_TIMEZONE` | `UTC` | initial study-day timezone (the app adopts the device timezone) |
| `KURU_MAX_UPLOAD_MB` | `2048` | maximum import size |
| `KURU_SOURCE_URL` | *(empty)* | "Source Code" link in Settings |

All backend settings are listed in [backend/README.md](../backend/README.md).

## HTTPS

Service workers and installation as an app require HTTPS (except on `localhost`). Put a reverse proxy
in front of the frontend, e.g. Caddy:

```
kuru.example.com {
  reverse_proxy localhost:3000
}
```

Imports are uploaded in 5 MB chunks, so default proxy body-size limits are fine as long as they are
at least 8 MB (nginx: `client_max_body_size 10m;`).

## Backups

Stop the stack (or use SQLite's online backup) and copy the volume:

```bash
docker compose stop backend
docker run --rm -v kuru_kuru-data:/data -v "$PWD":/backup alpine tar czf /backup/kuru-backup.tgz -C /data .
docker compose start backend
```

## Upgrades

```bash
git pull && docker compose up -d --build
```

Database migrations run automatically when the backend starts.

## Notes

* Run a single backend process: import progress is tracked in memory.
* The backend's rewrite target is fixed when the frontend image is built (`KURU_API_URL` build
  argument, default `http://backend:8000`).
