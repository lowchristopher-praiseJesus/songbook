# Cloudflare WAF Rate-Limiting Rules

These rules guard the five write endpoints against scripted abuse. Set them up in the
Cloudflare dashboard under **Security → WAF → Rate limiting rules**.

All rules use the Cloudflare free plan. Each rule blocks by IP for 10 minutes after
the threshold is exceeded. Thresholds are conservative — a normal user import triggers
at most one or two of these endpoints per session.

---

## Rule 1 — Share upload

| Field | Value |
|---|---|
| Rule name | `Rate limit share uploads` |
| When incoming requests match… | `(http.request.method eq "POST") and (http.request.uri.path eq "/share/upload")` |
| Also known as (URI path) | `/share/upload` |
| Requests | 10 |
| Period | 1 minute |
| Action | Block |
| Block duration | 10 minutes |
| Mitigation expression | Per IP |

---

## Rule 2 — Session create

| Field | Value |
|---|---|
| Rule name | `Rate limit session create` |
| When incoming requests match… | `(http.request.method eq "POST") and (http.request.uri.path eq "/session/create")` |
| Requests | 10 |
| Period | 1 minute |
| Action | Block |
| Block duration | 10 minutes |
| Mitigation expression | Per IP |

---

## Rule 3 — Conductor create

| Field | Value |
|---|---|
| Rule name | `Rate limit conductor create` |
| When incoming requests match… | `(http.request.method eq "POST") and (http.request.uri.path eq "/conductor/create")` |
| Requests | 10 |
| Period | 1 minute |
| Action | Block |
| Block duration | 10 minutes |
| Mitigation expression | Per IP |

---

## Rule 4 — Album create

| Field | Value |
|---|---|
| Rule name | `Rate limit album create` |
| When incoming requests match… | `(http.request.method eq "POST") and (http.request.uri.path eq "/album")` |
| Requests | 10 |
| Period | 1 minute |
| Action | Block |
| Block duration | 10 minutes |
| Mitigation expression | Per IP |

---

## Rule 5 — Walkie-share upload

| Field | Value |
|---|---|
| Rule name | `Rate limit walkie-share upload` |
| When incoming requests match… | `(http.request.method eq "POST") and (http.request.uri.path eq "/walkie-shares/upload")` |
| Requests | 10 |
| Period | 1 minute |
| Action | Block |
| Block duration | 10 minutes |
| Mitigation expression | Per IP |

---

## Verification

To verify a rule is active, fire 11 POST requests to the endpoint within one minute
from the same IP and confirm the 12th receives HTTP 429:

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<your-worker>.workers.dev/share/upload
done
```

The last line should print `429`.

## Tuning

Thresholds can be increased for endpoints that legitimate users hit more frequently.
Rule changes take effect immediately — no redeployment needed.
