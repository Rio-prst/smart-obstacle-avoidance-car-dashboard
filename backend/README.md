# Backend

NestJS backend for the Smart Obstacle-Avoidance Car Dashboard. It uses Prisma with PostgreSQL and exposes the REST API under `/api`.

## Implemented

- `GET /api/health`
- `POST /api/auth/login`
- JWT authentication guard
- Prisma schema and initial migration for `users`, `devices`, `telemetry`, `events`, `commands`, and `device_config`
- Seed for the admin user and the `car01` device

MQTT handling, Socket.IO realtime events, commands, test sessions, and analytics are not implemented yet. Their contracts are defined in `../docs/API_CONTRACT.md` and `../docs/MQTT_SPEC.md`.

## Requirements

- Node.js 22 LTS
- pnpm 11.9.0
- PostgreSQL 16

The repository includes a PostgreSQL service in `../docker-compose.yml`:

```powershell
docker compose up -d postgres
```

## Setup

```powershell
cd backend
pnpm install
Copy-Item .env.example .env
```

Edit `.env` before starting the application. Required values:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | At least 16 characters |
| `ADMIN_PASSWORD` | Used by the database seed |

All supported variables and their defaults are listed in `.env.example` and validated in `src/config/env.validation.ts`.

Generate the Prisma client, apply migrations, and seed the database:

```powershell
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

## Run

```powershell
pnpm start:dev
```

The API is available at `http://localhost:3000/api`. Health check: `http://localhost:3000/api/health`.

Production build:

```powershell
pnpm build
pnpm start:prod
```

## Scripts

| Command | Description |
|---|---|
| `pnpm start` | Start once without watch mode |
| `pnpm start:dev` | Start with watch mode |
| `pnpm start:debug` | Start with debug and watch mode |
| `pnpm build` | Build to `dist/` |
| `pnpm start:prod` | Run the built application |
| `pnpm lint` | Run ESLint with zero warnings allowed |
| `pnpm lint:fix` | Run ESLint and apply fixes |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:cov` | Run unit tests with coverage |
| `pnpm test:e2e` | Run end-to-end tests |
| `pnpm prisma:generate` | Generate the Prisma client |
| `pnpm prisma:migrate` | Run `prisma migrate dev` |
| `pnpm prisma:seed` | Seed the admin user and `car01` device |

The e2e suite starts the full NestJS application and needs a running, seeded PostgreSQL database. The e2e timeout is 60 seconds because the first start can take 10-30 seconds.

## Structure

```text
src/
  auth/       JWT login, strategy, guard, public decorator
  common/     Exception filter
  config/     Environment validation
  health/     Health endpoint
  prisma/     Prisma module and service
prisma/
  schema.prisma
  migrations/
  seed.ts
test/
  app.e2e-spec.ts
  jest-e2e.json
```

## API conventions

- Base path: `/api`, without a version segment.
- Response messages are written in English.
- Errors use the shape `{"error":{"code":"...","message":"...","details":[...]}}`.
- Access tokens are sent as `Authorization: Bearer <jwt>`.
