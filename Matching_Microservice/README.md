# Player/Group Matching Microservice

**Port:** 3005 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

Lets players discover open sessions and join alone or as a group. Answers: **who wants to play together?**

A `Match` is the joinable side of a reservation opened for matching. Joining is atomic (no overbooking under concurrency) and re-validates the reservation with the Reservation service.

| Method | Path | Notes |
|---|---|---|
| GET | `/matches?type=&skillLevel=&from=&to=` | Upcoming open sessions with `slotsLeft` |
| GET | `/matches/mine` | Hosted or joined |
| GET | `/matches/:id` | |
| POST | `/matches/:id/join` | Body: `{ groupId? }` (group owner only; counts all members) |
| POST | `/matches/:id/leave` | |
| POST | `/groups` | Body: `name, description?, skillLevel?, isPublic?, maxMembers?` |
| GET | `/groups?scope=mine\|public` | |
| GET | `/groups/:id` | |
| POST | `/groups/:id/join` , `/groups/:id/leave` | |
| DELETE | `/groups/:id` | Owner or staff |
| POST | `/internal/matches` , `/internal/matches/reservation/:id/close` | Reservation service |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
