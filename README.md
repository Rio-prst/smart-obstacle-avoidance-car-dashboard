# Smart Obstacle-Avoidance Car Dashboard

IoT final project: an ESP32 car avoids obstacles locally, and this repository provides the dashboard backend for telemetry, commands, configuration, test sessions, analysis, and data export. The car does not depend on the dashboard for safety; obstacle avoidance and stop behavior are handled by the local firmware.

## Repository layout

| Path | Description |
|---|---|
| `backend/` | NestJS REST API with Prisma and PostgreSQL |
| `frontend/` | React dashboard (not scaffolded yet; only `.env.example` exists) |
| `docs/` | Product, API, MQTT, database, safety, design, and task documents |
| `docker-compose.yml` | Local PostgreSQL 16 instance for development |

## Current state

- Backend: health endpoint, JWT login, Prisma schema, initial migration, and seed for the admin user and `car01` device.
- Frontend: not scaffolded yet.
- MQTT, realtime events, command handling, test sessions, analytics, and firmware integration are planned in `docs/TASK.md`.

## Requirements

- Node.js 22 LTS
- pnpm 11.9.0
- Docker Desktop, or a PostgreSQL 16 instance
- An MQTT broker only for the stages that use MQTT

Enable pnpm through Corepack if it is not installed:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

## Backend quick start

1. Start PostgreSQL from the repository root:

   ```powershell
   docker compose up -d postgres
   ```

2. Configure and run the backend:

   ```powershell
   cd backend
   pnpm install
   Copy-Item .env.example .env
   ```

   Edit `backend/.env` and set `JWT_SECRET`, `ADMIN_PASSWORD`, and `DATABASE_URL` if needed.

   ```powershell
   pnpm prisma:generate
   pnpm prisma:migrate
   pnpm prisma:seed
   pnpm start:dev
   ```

On Linux or macOS, use `cp .env.example .env` instead of `Copy-Item`.

The API runs at `http://localhost:3000/api`. Health check: `http://localhost:3000/api/health`.

## Frontend

The frontend is not scaffolded yet. Its environment template is available at `frontend/.env.example`. See `frontend/README.md` for the planned stack and environment variables.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service and database health |
| `POST` | `/api/auth/login` | JWT login |

All endpoints defined in `docs/API_CONTRACT.md` use the `/api` prefix, without a version segment.

## Documentation

- `docs/PRD.md`: features and acceptance criteria
- `docs/ARCHITECTURE.md`: system structure and technical decisions
- `docs/API_CONTRACT.md`: REST and WebSocket contract
- `docs/MQTT_SPEC.md`: MQTT topics and payloads
- `docs/DB_SCHEMA.md`: database schema and ERD
- `docs/SAFETY_RULES.md`: safety rules
- `docs/DESIGN.md`: UI rules
- `docs/TESTING.md`: test plan
- `docs/TASK.md`: implementation stages

## Conventions

- API base path is `/api`; do not add a version segment.
- API response messages are written in English.
- UI copy is written in Indonesian.
- Code, identifiers, and commit messages are written in English.
- Do not commit `.env` files or secrets.
