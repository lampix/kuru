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

## Proxmox VE (LXC)

On the Proxmox host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/lampix/kuru/main/proxmox/ct/kuru.sh)"
```

The script uses the [community-scripts.org](https://community-scripts.org) engine: it asks for the
container settings (defaults: Debian 13, 2 CPU, 1 GB RAM, 8 GB disk, unprivileged) and runs
[`proxmox/install/kuru-install.sh`](../proxmox/install/kuru-install.sh) inside the new container.
Kuru then listens on port 3000 of the container.

* No Docker: two systemd services, `kuru-backend` (uvicorn on `127.0.0.1:8000`) and
  `kuru-frontend` (Next.js on `PORT`, proxying `/api`).
* `/opt/kuru` — the release, replaced on every update. `/opt/kuru-data` — database and media.
  `/opt/kuru.env` — settings (the variables from [backend/README.md](../backend/README.md) plus
  `PORT`); apply changes with `systemctl restart kuru-backend kuru-frontend`.
* **Updates:** run `update` in the container's shell. It installs the newest
  [GitHub release](https://github.com/lampix/kuru/releases) if there is one, after copying the
  database to `/opt/kuru-data/kuru.db.pre-update`. Migrations run when the backend starts.
* The container installs prebuilt release bundles (`kuru-<version>-linux-<amd64|arm64>.tar.gz`), so
  it needs no build tools and little memory. [`scripts/build-release.sh`](../scripts/build-release.sh)
  builds them; the [release workflow](../.github/workflows/release.yml) publishes them.
* To test scripts from a fork or branch, set `COMMUNITY_SCRIPTS_URL` to its `proxmox/` folder, e.g.
  `COMMUNITY_SCRIPTS_URL=https://raw.githubusercontent.com/<you>/kuru/<branch>/proxmox bash -c "$(curl …/ct/kuru.sh)"`.

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

In the Proxmox container: `update`.

Database migrations run automatically when the backend starts.

## Notes

* Run a single backend process: import progress is tracked in memory.
* The backend's rewrite target is fixed when the frontend image is built (`KURU_API_URL` build
  argument, default `http://backend:8000`).

## Releasing

1. Set the version in `backend/pyproject.toml` and `frontend/package.json`, move the
   `Unreleased` entries in `CHANGELOG.md` under a new `## [X.Y.Z] - date` heading, commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`

The release workflow checks that the tag matches both versions, builds the amd64 and arm64 bundles,
and publishes a GitHub release with the changelog section as notes. Proxmox containers pick it up on
their next `update`.
