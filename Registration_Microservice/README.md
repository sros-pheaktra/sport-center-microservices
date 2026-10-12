# Registration Microservice

**Port:** 3001 (internal only, reachable via the API Gateway) &nbsp;|&nbsp; **Health:** `GET /health`

Owns user accounts (`User` model, bcrypt-hashed passwords). Answers: **who are the users?**

| Method | Path (service) | Via gateway | Notes |
|---|---|---|---|
| POST | `/register` | `POST /api/auth/register` | Public. Body: `name, email, password, phone?`. Role is `customer` unless `role` + valid `staffCode` are sent |
| POST | `/internal/verify` | — | Called by Authentication service |
| GET | `/internal/users/:id` | — | Internal lookup |

## Configuration
Copy `.env.example` to `.env`. `INTERNAL_API_KEY` must be identical in every service.

## Run
```bash
npm install
npm run dev          # needs MongoDB; set MONGO_URI to mongodb://localhost:27017/... when running outside Docker
```
