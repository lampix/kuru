# Security policy

## Reporting a vulnerability

Please report security issues privately via GitHub's **"Report a vulnerability"** (Security
advisories) on this repository rather than opening a public issue. Include steps to reproduce and the
affected version. You can expect an initial response within a week.

## Scope and hardening notes

* Kuru is designed for self-hosting. Set `KURU_ACCESS_TOKEN` and serve it over HTTPS when it is
  reachable from untrusted networks.
* Card HTML from imported decks is sanitised (DOMPurify) and rendered inside a Shadow DOM; deck
  JavaScript is never executed.
* Imported archives are read from fixed member names only; media is stored content-addressed, never
  under user-supplied paths.
