# Facility Microservice

**Port:** 3003 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

Catalogue of courts and fields (basketball, football, badminton, tennis). Status: `active`, `under_maintenance`, `inactive`. Answers: **what facilities exist?**

| Method | Path | Access |
|---|---|---|
| GET | `/?type=&status=&q=&page=&limit=` | any signed-in user (customers don't see `inactive`) |
| GET | `/:id` | any signed-in user |
| POST | `/` | admin |
| PUT | `/:id` | admin |
| PATCH | `/:id/status` | admin, Maintenance service. Body: `{ status, onlyIfCurrent? }` |
| DELETE | `/:id` | admin |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
