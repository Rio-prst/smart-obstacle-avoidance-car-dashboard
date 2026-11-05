# Smart Obstacle-Avoidance Car Dashboard

IoT final project: an ESP32 car avoids obstacles locally, and this repository provides the dashboard for telemetry, commands, configuration, test sessions, analysis, and data export. The car does not depend on the dashboard for safety; obstacle avoidance and stop behavior are handled by the local firmware.

## Repository layout

| Path                 | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `backend/`           | NestJS REST API with Prisma and PostgreSQL                       |
| `frontend/`          | React dashboard with a mock-data demo mode                       |
| `docs/`              | Product, API, MQTT, database, safety, design, and task documents |
| `docker-compose.yml` | Local PostgreSQL 16 instance for development                     |

## Current state

- Backend: health endpoint, JWT login, Prisma schema, initial migration, and seed for the admin user and `car01` device.
- Frontend: interactive demo with Dashboard, Kendali, Riwayat, Sesi Uji, Analisis, and Konfigurasi using in-memory simulated data.
- The demo supports START/STOP, AUTO/MANUAL mode changes, hold-to-move manual control, history filters, session creation and completion, trial records, analytics filters, validated configuration updates, and CSV export for history and sessions.
- The frontend runs independently of the backend, database, MQTT broker, and ESP32. It has no login flow and does not use the backend JWT endpoint yet.
- Demo changes are not persisted. Reloading the page restores seeded data and resets simulated device state, commands, sessions, trials, and configuration. Demo analytics are not measurements from a physical car.
- MQTT, realtime events, real command handling, persistent test sessions, and firmware integration remain planned in [`docs/TASK.md`](docs/TASK.md).

## Requirements

- Node.js 22 LTS
- pnpm 11.9.0
- Docker Desktop, or a PostgreSQL 16 instance, for backend development only
- An MQTT broker only for the stages that use MQTT

The frontend demo only needs Node.js and pnpm.

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

## Frontend quick start

The dashboard demo uses simulated live data, so it does not need the backend yet.

```powershell
cd frontend
pnpm install
Copy-Item .env.example .env
pnpm dev
```

The dashboard runs at `http://localhost:5173`. Keep `VITE_USE_MOCK_DATA=true` for the demo; mock mode is also enabled when the variable is unset. Setting it to `false` shows an integration-not-available error, not a working API-backed dashboard. API and WebSocket URL settings are reserved for future frontend integration.

### Demo workflow

- **Dashboard:** view simulated telemetry, charts, and recent events. START is in Perintah Cepat; STOP remains available in the global header on every page.
- **Kendali:** use the main START/STOP panel, switch modes while stopped, or use manual direction buttons. START requires an online device in AUTO at STOP. STOP does not change the mode, so START stays disabled in MANUAL.
- **Sesi Uji:** record test conditions and individual trial results. Starting or ending a session does not start or stop the car. Obstacle metadata is entered manually; it is not needed for the car to detect obstacles.
- **Konfigurasi:** adjust simulated distance thresholds and motor PWM limits. PWM is a motor command, not measured speed.
- **Riwayat and Analisis:** inspect demo history and summaries. History and session data can be exported as CSV.

See [`frontend/README.md`](frontend/README.md) for setup details, scripts, and demo limitations.

## Safety and demo limitations

The frontend demo is not hardware validation or a production-ready control system. Real obstacle avoidance and safety decisions must run locally on the ESP32 after integration, without depending on dashboard connectivity.

**STOP from the dashboard is not an emergency stop:** a network command can be delayed or fail. A physical power switch and physical STOP button are required for real-car testing. Reverse movement is not supported because there is no rear sensor. See [`docs/SAFETY_RULES.md`](docs/SAFETY_RULES.md).

## API

| Method | Path              | Description                 |
| ------ | ----------------- | --------------------------- |
| `GET`  | `/api/health`     | Service and database health |
| `POST` | `/api/auth/login` | JWT login                   |

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
