# Maintenance Microservice

**Port:** 3006 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

Tracks repair/maintenance tickets so unavailable courts cannot be reserved. Answers: **what facilities need repair?**

Ticket lifecycle: `scheduled → in_progress → completed` (or `cancelled`). `in_progress` sets the facility to `under_maintenance`; completing the last open ticket restores it to `active`. Future (`scheduled`) windows block reservations through the `/check` endpoint. A background job (`SYNC_INTERVAL_MS`) starts due tickets and heals facility status if a call failed.

Creating a ticket over existing reservations returns **409 + the conflicts**; resend with `"force": true` to cancel them.

| Method | Path | Access |
|---|---|---|
| POST | `/` | admin. Body: `facilityId, title, description?, priority?, startTime, endTime, force?` |
| GET | `/?status=&facilityId=` | admin |
| GET / PUT | `/:id` | admin |
| PATCH | `/:id/status` | admin. Body: `{ status }` |
| GET | `/facility/:facilityId/check?start=&end=` | Reservation service |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
