# API Gateway

**Port:** 3000 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

The only published port. Verifies the JWT, enforces role rules, strips client identity headers, forwards `x-user-id / x-user-name / x-user-role` plus the shared `x-internal-key`, rate-limits (300 req/min, 50 auth attempts/15 min), and hides every `/internal` route. Answers: **where does the request go, and is the user authorized?**

| Prefix | Target | Who |
|---|---|---|
| `/api/auth` | Registration / Authentication | register + login public, `/me` signed-in |
| `/api/facilities` | Facility | GET: any user; write: admin, manager |
| `/api/reservations` | Reservation | any signed-in user |
| `/api/matching` | Matching | any signed-in user |
| `/api/maintenance` | Maintenance | admin, manager |
| `/health`, `/health/services` | — | public |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
