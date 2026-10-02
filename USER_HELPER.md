# RouteRix: Admin Helper

What RouteRix is, how it's built, how to run it, and where every key and secret goes.

> **Security note:** This file lists where keys go. It never contains the key values. Real values belong only in `backend/.env`, which git ignores (`.gitignore` → `.env*`). Never paste a real key into this file, the source code, or `.env.example`.

---

## 1. What RouteRix does

RouteRix is a traffic-allocation simulator for the **Bhopal** road network (project SIH26137).

1. A user signs in and picks an **origin** and a **destination** on a map of Bhopal.
2. The backend finds **K different candidate routes** between them (K = 1–10, default 5).
3. It splits the traffic demand (N vehicles, in PCU/h) across those routes two ways:
   - **Baseline (Dijkstra, all-or-nothing):** every vehicle takes the fastest route, which is what drivers do on their own.
   - **Optimized (QPSO):** Quantum-behaved Particle Swarm Optimization searches for the split that gives the **lowest total network travel time**.
4. Both splits are scored with the same **BPR congestion model**. The UI shows the time saved, the routes, congestion per road, animated vehicles, and a QPSO convergence chart.
5. Every run is saved to the user's **trip history**. The Account page shows stats.

### Scenarios
| Key | Meaning | Background V/C | Demand × | Notes |
|---|---|---|---|---|
| `live` | Live traffic | observed | 1.0 | Uses real speeds from the **HERE Traffic API**. Needs `HERE_API_KEY`. |
| `normal` | Normal traffic | 0.3 | 1.0 | |
| `peak` | Peak hours | 0.6 | 1.5 | Default in the UI |
| `high_demand` | High demand | 0.3 | 2.0 | |
| `road_closure` | Road closure | 0.3 | 1.0 | Closes the highest-capacity segment on the fastest route, as long as O→D stays reachable |

Users can also click the map to close up to 20 roads. Each click snaps to a road within 60 m and closes it in both directions.

---

## 2. Architecture

```
 Browser (Next.js / React, :3000)
   │  fetch("/api/...")        same origin, so the session cookie stays first-party and no CORS is needed
   ▼
 Next.js rewrite (next.config.ts):  /api/:path*  →  API_URL (default http://127.0.0.1:8000)
   ▼
 FastAPI backend (Python, :8000)  backend/main.py
   ├── accounts.py      users, sessions, password reset, trips, stats  →  SQLite (backend/data/routerix.db)
   ├── network.py       Bhopal road graph from OpenStreetMap (OSMnx)    →  backend/data/bhopal_drive.graphml
   ├── simulate.py      candidate routes, scenarios, baseline vs QPSO
   ├── traffic.py       BPR congestion model + evaluation
   ├── qpso.py          QPSO optimizer
   └── live_traffic.py  HERE Traffic API v7 client  →  https://data.traffic.hereapi.com/v7/flow

 Browser also calls these directly (no key needed):
   - Nominatim (OpenStreetMap) geocoding: https://nominatim.openstreetmap.org
   - Map tiles: OpenStreetMap (tile.openstreetmap.org), Esri satellite (server.arcgisonline.com)
```

### Tech stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Leaflet + react-leaflet
- **Backend:** Python, FastAPI, Uvicorn, OSMnx, NetworkX, NumPy, Pydantic 2, python-dotenv
- **Database:** SQLite through the Python stdlib (WAL mode). No separate DB server.

### Frontend files (`src/`)
| File | Purpose |
|---|---|
| `src/app/page.tsx` | Main simulator screen: search fields, scenario picker, run button, results, comparison, convergence chart, GPS "follow me" |
| `src/components/RouteMap.tsx` | Leaflet map: routes, congestion colours, animated vehicles, live-traffic layer, click-to-pick and click-to-close |
| `src/app/login/page.tsx` | Sign in, sign up, and forgot password |
| `src/app/reset-password/page.tsx` + `src/components/ResetForm.tsx` | Set a new password from the emailed link |
| `src/app/account/page.tsx` | Stats, trip history, profile edit, password change |
| `src/components/AppHeader.tsx`, `AuthShell.tsx` | Shared layout pieces |
| `src/lib/api.ts` | All API calls, TypeScript types, geocoding (Nominatim), UI class constants |
| `src/app/layout.tsx`, `globals.css` | Root layout, fonts, and light/dark theme |

### Backend files (`backend/`)
| File | Purpose |
|---|---|
| `main.py` | FastAPI app: routes, auth cookie, rate limits. Loads `.env` on startup, then preloads the graph (~12 s) |
| `accounts.py` | SQLite schema, scrypt password hashing, sessions, password reset + SMTP email, trips, stats, in-memory rate limiter |
| `network.py` | Downloads and caches the Bhopal drive network. Sets road capacity from **IRC:106-1990**. Snaps points to the nearest road |
| `simulate.py` | `run_routerix_simulation()` handles scenarios, closures, live traffic, candidate routes, baseline vs QPSO |
| `traffic.py` | BPR function `t = t0·[1 + 0.15·(V/C)^4]` and route/network evaluation |
| `qpso.py` | QPSO (Sun, Feng & Xu 2004) plus `repair()`, which turns a particle into an integer split that adds up to exactly Q vehicles |
| `live_traffic.py` | HERE flow fetch (cached 120 s per bbox), matching HERE segments to OSM edges, V/C back-calculated from observed speed |
| `test_routerix.py` | Self-contained tests (QPSO, BPR, repair, accounts flow) |
| `requirements.txt` | Python dependencies |
| `.env.example` | Template for `backend/.env` |

### How one simulation works (`POST /simulate`)
1. Snap the origin and destination to the nearest graph nodes. Reject if either is more than 1000 m from a road, or if both snap to the same node.
2. Apply the user's closures (snap within 60 m, close both directions, and make sure the destination is still reachable).
3. `live` scenario only: fetch HERE flow for the O-D box plus padding. Match segments to major OSM roads (≤25 m, same direction). Use the observed speeds, and remove roads HERE reports as closed (only if O→D stays reachable).
4. `road_closure` scenario only: close the main road segment.
5. **Candidate routes (penalty method):** run Dijkstra up to K times, multiplying the weight of already-used edges by 1.4 each time so the routes diverge.
6. Build the route-edge incidence matrix, capacities, free-flow times, and background volume.
7. **Baseline:** all Q vehicles on route 0. **QPSO:** 30 particles × 100 iterations, minimizing total vehicle-hours.
8. Return routes, per-edge V/C, both evaluations, improvement %, convergence, and assumptions. The result is zlib-compressed and saved as a trip.

### Road network data
- Source: OpenStreetMap, `"Bhopal, Madhya Pradesh, India"`, network type `drive`.
- Cached at `backend/data/bhopal_drive.graphml`. If the file is missing, it is downloaded automatically on first start (slow). To force a fresh download, run `backend/.venv/Scripts/python network.py` from `backend/`.
- OSMnx HTTP cache: `backend/cache/` (safe to delete).
- Capacity (PCU/h per lane per direction, IRC:106): arterial 900 divided / 750 undivided, sub-arterial 725 / 600, collector 450.

---

## 3. API endpoints

The frontend reaches all of these as `/api/...`. Endpoints marked 🔒 need the `routerix_session` cookie.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | name, email, password (8–128 chars). Rate limit: 10/h per IP |
| POST | `/auth/login` | Rate limit: 10 per 15 min per email, 30 per 15 min per IP |
| POST | `/auth/logout` | Clears the session |
| POST | `/auth/forgot` | Sends a reset email. Always returns the same response, so it doesn't reveal whether the account exists |
| POST | `/auth/reset` | token + new password. Signs the user out everywhere |
| GET / PATCH | `/me` 🔒 | Profile. Changing the email needs the current password |
| POST | `/me/password` 🔒 | Signs out the user's other devices |
| GET | `/config` | `{live_traffic, email, scenarios}`: tells the UI which features are configured |
| POST | `/simulate` 🔒 | Rate limit: 60/min per user. Vehicles 1–20000, K 1–10, up to 20 closures |
| GET | `/traffic?south&west&north&east` 🔒 | HERE flow lines for the map layer (max ~0.35° box) |
| GET | `/trips`, `/trips/{id}` 🔒 | History / full saved result |
| DELETE | `/trips/{id}` 🔒 | |
| GET | `/stats` 🔒 | Totals, by scenario, last 30 days |

Interactive API docs: http://127.0.0.1:8000/docs (FastAPI auto-generated).

---

## 4. API keys, secrets & configuration: where they live

**The only secrets file is `backend/.env`.** It is loaded by `load_dotenv()` at the top of `backend/main.py`. It is **not in the repo** (git ignores it). Create it from the template:

```bash
cp backend/.env.example backend/.env
```

Every value is optional. The app runs without any of them, with the fallbacks listed below.

### 4.1 `HERE_API_KEY`: live traffic
| | |
|---|---|
| **Put it in** | `backend/.env` → `HERE_API_KEY=...` |
| **Read by** | `backend/live_traffic.py`: `available()` (line ~26) and `fetch_flow()` (line ~30). Sent as the `apiKey` query parameter to `https://data.traffic.hereapi.com/v7/flow` |
| **Used for** | The "Live traffic (HERE)" scenario and the "Live traffic" map layer |
| **Where to get it** | https://platform.here.com → sign up (free tier) → *Access Manager* / your project → *Apps* → create an app → **API Keys** → *Create API key*. Make sure the app has access to the **Traffic API v7** |
| **If missing** | The Live scenario is greyed out in the UI ("needs HERE_API_KEY"), and `/traffic` returns 503. Everything else still works |
| **If wrong / over quota** | The error reads "HERE Traffic API returned HTTP 401/403/429 (check HERE_API_KEY and quota)" |

### 4.2 SMTP settings: password-reset email
| Variable | Example | Notes |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | **If empty, no email is sent.** The reset link is printed in the API console log instead (handy in dev) |
| `SMTP_PORT` | `587` | 587 = STARTTLS, 465 = SSL |
| `SMTP_USER` | `you@gmail.com` | Login username |
| `SMTP_PASSWORD` | 16-character app password | **Secret** |
| `SMTP_FROM` | `RouteRix <you@gmail.com>` | Falls back to `SMTP_USER` |

- **Put them in:** `backend/.env`
- **Read by:** `backend/accounts.py` → `send_mail()` (line ~237). `SMTP_HOST` is also checked in `backend/main.py` → `/config`.
- **Where to get a Gmail app password:** Google Account → *Security* → turn on **2-Step Verification** → https://myaccount.google.com/apppasswords → create an app password named "RouteRix" → copy the 16 characters (no spaces) into `SMTP_PASSWORD`. Don't use your normal Gmail password.

### 4.3 Other environment variables (not secret)
| Variable | Where set | Read by | Default / purpose |
|---|---|---|---|
| `APP_URL` | `backend/.env` | `accounts.py` (reset link), `main.py` (cookie) | `http://localhost:3000`. If it starts with `https://`, the session cookie is marked **Secure**. **Set this to the real public URL in production** |
| `ROUTERIX_DB` | shell env / `.claude/launch.json` | `accounts.py` | `backend/data/routerix.db`. The alt dev setup uses `backend/data/routerix-dev.db` |
| `API_URL` | shell env when running Next.js | `next.config.ts` | `http://127.0.0.1:8000`, where `/api/*` is proxied |
| `NEXT_DIST_DIR` | shell env | `next.config.ts` | `.next`. Lets a second dev server run from the same folder (`.next-alt`) |

### 4.4 Services that need no key
- **OpenStreetMap / Overpass** (road network download, via OSMnx): no key
- **Nominatim** geocoding (`src/lib/api.ts`): no key. The usage policy allows at most 1 request/s
- **OSM tiles** and **Esri World Imagery** tiles (`src/components/RouteMap.tsx`): no key

### 4.5 Other secrets stored by the app (not keys, but protect them)
- `backend/data/routerix.db` holds user accounts. Passwords are **scrypt**-hashed, and session and reset tokens are stored only as **SHA-256 hashes**, so a leaked DB doesn't expose passwords or usable tokens. Still, back it up and don't commit it (`/backend/data/` is gitignored).
- There is **no server-side signing secret** to rotate. Sessions are random 32-byte tokens kept in the DB for 30 days. To sign everyone out, run `DELETE FROM sessions;`.

---

## 5. Running it

### First-time setup
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
cp .env.example .env      # then fill in keys (optional)
cd ..
npm install
```

### Start (two terminals)
```bash
cd backend && .venv/Scripts/uvicorn main:app --reload --port 8000
```
```bash
npm run dev
```
Open http://localhost:3000. The API takes about 12 s to load the Bhopal graph before it accepts requests.

The same configs live in `.claude/launch.json`: `api` (:8000) and `web` (:3000), plus `api-alt` (:8001, dev DB) and `web-alt` (:3001) for a second parallel setup.

### Tests / self-checks
```bash
cd backend && .venv/Scripts/python test_routerix.py
```
```bash
cd backend && .venv/Scripts/python live_traffic.py
```
```bash
cd backend && .venv/Scripts/python simulate.py
```
- `test_routerix.py` runs the unit tests and needs no graph.
- `live_traffic.py` runs a matching self-check against a fake HERE response and needs no key.
- `simulate.py` runs a benchmark of every scenario from MP Nagar to Bhopal Junction.

Lint the frontend with `npm run lint`.

---

## 6. Admin tasks & troubleshooting

| Task / symptom | What to do |
|---|---|
| "Can't reach the server. Is the API running on :8000?" | Start uvicorn. Check that `API_URL` matches the API port |
| Live traffic option disabled | Add `HERE_API_KEY` to `backend/.env` and restart the API |
| Reset emails not arriving | `SMTP_HOST` is empty (the link is in the API log instead), or the Gmail app password is wrong. Check the API log for "Sending email ... failed" |
| Reset link points at localhost in production | Set `APP_URL` in `backend/.env` |
| "Too many attempts. Try again in N min." | In-memory rate limit. Restarting the API clears it |
| Point rejected: "m from the nearest Bhopal road" | The click is outside Bhopal or more than 1 km from any road |
| Refresh the road map | Delete `backend/data/bhopal_drive.graphml` and restart (or run `python network.py`) |
| List users | `sqlite3 backend/data/routerix.db "SELECT id,email,name,created_at,last_login_at FROM users;"` |
| Delete a user (cascades sessions + trips) | `sqlite3 backend/data/routerix.db "PRAGMA foreign_keys=ON; DELETE FROM users WHERE email='x@y.com';"` |
| Sign everyone out | `sqlite3 backend/data/routerix.db "DELETE FROM sessions;"` |
| Back up | Copy `backend/data/routerix.db` (plus the `-wal`/`-shm` files if the API is running) |

### Known limits (deliberate)
- The rate limiter is **in-process**. If you run more than one API worker, move it to Redis (see the `ponytail:` note in `accounts.py`).
- SQLite is fine for a single server. Switch to Postgres only if you need multiple servers.
- Only Bhopal is supported. The city is set by `PLACE` in `backend/network.py`, and the geocoding box in `src/lib/api.ts` would also need updating.

### Production checklist
- [ ] `APP_URL=https://your-domain` (turns on the Secure cookie and fixes reset links)
- [ ] Serve over HTTPS, with the Next.js app proxying `/api` to the backend (keeps cookies first-party)
- [ ] `backend/.env` exists on the server only and is never committed
- [ ] SMTP configured so password reset works
- [ ] Single API worker (or a shared rate limiter)
- [ ] Regular backups of `backend/data/routerix.db`
