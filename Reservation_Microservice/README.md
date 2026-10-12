# Reservation Microservice

**Port:** 3004 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

Books facilities and owns the schedule. Answers: **who reserved a facility and when?**

On create it (1) loads the facility and requires `active`, (2) asks Maintenance whether the slot is blocked, (3) rejects overlapping bookings, (4) re-checks after insert to defeat concurrent double-booking. If `isOpenForMatching` is set it notifies Matching (best-effort — a reservation never fails because matching is down).

| Method | Path | Access |
|---|---|---|
| POST | `/` | signed-in. Body: `facilityId, startTime, endTime, notes?, isOpenForMatching?, playersNeeded?, skillLevel?` |
| GET | `/my` | own reservations |
| GET | `/` | admin, manager (filters: `facilityId, userId, status, from, to`) |
| GET | `/availability?facilityId=&date=YYYY-MM-DD` | signed-in: booked slots + maintenance windows (UTC day) |
| GET | `/:id` | owner or staff |
| PATCH | `/:id/cancel` | owner or staff |
| PATCH | `/:id/matching` | owner. Body: `{ isOpenForMatching, playersNeeded?, skillLevel? }` |
| GET | `/internal/conflicts` | Maintenance service |
| POST | `/internal/cancel-conflicts` | Maintenance service |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
