# Authentication Microservice

**Port:** 3002 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

Verifies credentials with the Registration service and issues a signed JWT (HS256). Locks an email out for 15 min after `MAX_FAILED_LOGINS` failures (`LoginAttempt` collection, auto-expires after 24h). Answers: **is the user authenticated?**

| Method | Path (service) | Via gateway | Notes |
|---|---|---|---|
| POST | `/login` | `POST /api/auth/login` | Body: `email, password` → `{ token, user }` |
| GET | `/me` | `GET /api/auth/me` | Bearer token required |
| POST | `/verify` | — | Validates a token, returns claims |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
