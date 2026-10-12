# Sports Facility Reservation & Player Matching System

Cloud-native microservices (Node.js · Express · MongoDB · Docker) that let customers reserve courts and fields — basketball, football, badminton, tennis — and optionally **open a reservation for matching** so other players or groups can find and join the session. Maintenance tickets automatically make facilities unreservable.

## Quick start
```bash
docker compose up --build -d          # first run builds all 7 images
curl http://localhost:3000/health/services
node scripts/smoke-test.js            # optional end-to-end check (Node 18+)
docker compose logs -f api-gateway
docker compose down                   # add -v to wipe the database
```
Everything is reached through **http://localhost:3000**. The `.env` files ship with development values — change `JWT_SECRET`, `INTERNAL_API_KEY` and `STAFF_SIGNUP_CODE` before deploying anywhere real (`.env` is git-ignored; copy from `.env.example`).

## Architecture
```
                      ┌────────────────────────── Docker network (private) ───────────────────────────┐
 Client ──► API Gateway ──► Registration ◄── Authentication (issues JWT)
 :3000       verifies JWT ─► Facility ◄──────────────┐
             checks role  ─► Reservation ──► Facility (exists + active?)
             adds identity│                ──► Maintenance (slot blocked?)
                          │                ──► Matching (open / close session)
                          ─► Matching ─────► Reservation (still valid?)
                          ─► Maintenance ──► Facility (set status)
                                          ──► Reservation (conflicts / cancel)
                      └────────────────────────────────────────────────────────────────────────────────┘
                                   MongoDB: registration_db · auth_db · facility_db · reservation_db · matching_db · maintenance_db
```

| # | Service | Port | Database | Answers |
|---|---|---|---|---|
| 1 | API Gateway | 3000 (published) | — | Where does the request go, and is the user authorized? |
| 2 | Registration | 3001 | registration_db | Who are the users? |
| 3 | Authentication | 3002 | auth_db | Is the user authenticated? |
| 4 | Facility | 3003 | facility_db | What facilities exist? |
| 5 | Reservation | 3004 | reservation_db | Who reserved a facility and when? |
| 6 | Matching | 3005 | matching_db | Who wants to play together? |
| 7 | Maintenance | 3006 | maintenance_db | What facilities need repair? |

### Design decisions
- **Database per service.** One Mongo container, six databases; no service reads another's collections — only HTTP.
- **Zero-trust inside.** Only the gateway is published. Every service rejects requests lacking `x-internal-key`, and only trusts the identity headers the gateway derives from a verified JWT. `/internal/*` routes are unreachable from outside and restricted to the `system` role.
- **Roles:** `customer`, `manager`, `admin`. Staff roles need `STAFF_SIGNUP_CODE` at registration.
- **Resilience:** `/health` on every service, Docker health checks + `depends_on: service_healthy`, 5 s timeouts on service calls, clean 503s when a dependency is down, matching notifications are best-effort.
- **Correctness under concurrency:** double-booking guard (check, insert, re-check), atomic join with `$expr` capacity check, atomic group join.
- **Stateless containers**, config entirely from environment, non-root images, graceful SIGTERM.

### Typical flow
1. `POST /api/auth/register` → `POST /api/auth/login` → use `Authorization: Bearer <token>`.
2. Admin creates facilities: `POST /api/facilities`.
3. Customer books: `POST /api/reservations` with `isOpenForMatching: true, playersNeeded: 3`.
4. Others browse `GET /api/matching/matches?type=badminton` and `POST /api/matching/matches/:id/join` (optionally `{ "groupId": "..." }`).
5. Staff schedules repairs: `POST /api/maintenance` — conflicting reservations return 409 unless `force: true`.

Full endpoint tables are in each service's README.

## Known limitations / next steps
- **No notification service:** participants aren't told when a session is cancelled (the match just flips to `cancelled`). A message queue (RabbitMQ/Kafka) would replace the synchronous HTTP calls and enable this.
- Availability is computed per **UTC** day; add a venue time zone and opening hours for production.
- JWTs are not revocable before expiry (no refresh/blacklist).
- No automated unit tests yet; `scripts/smoke-test.js` is the end-to-end check.
- Single Mongo node; use a replica set for production (also enables transactions).
