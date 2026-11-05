# Smart Car Dashboard — Frontend

Interactive React demo for the Smart Obstacle-Avoidance Car Dashboard. UI copy is in Indonesian.

## Status

- Dashboard, Kendali, Riwayat, Sesi Uji, Analisis, and Konfigurasi are available as interactive demo pages.
- Data comes from a local simulator. The demo does not require the backend, PostgreSQL, an MQTT broker, or an ESP32.
- Frontend authentication, REST/WebSocket integration, and real device commands are not implemented. The sidebar identifies the app/demo rather than presenting a signed-in account.
- Mock state is in memory. Reloading the page restores seeded data and resets simulated device state, telemetry, sessions, trials, commands, and configuration.
- History and session data support client-side CSV export. Analytics include synthetic sample data, not evidence of physical-car performance.

## Stack

- React 18 + Vite 5 + TypeScript
- Tailwind CSS v4 + shadcn/ui primitives
- TanStack Query, Recharts, React Router, lucide-react, Sonner
- Vitest + Testing Library

## Setup

Use Node.js 22 LTS and pnpm 11.9.0. From the repository root:

```powershell
cd frontend
pnpm install
Copy-Item .env.example .env
pnpm dev
```

On Linux or macOS, use `cp .env.example .env`.

The dashboard runs at `http://localhost:5173`. Keep `VITE_USE_MOCK_DATA=true`; mock mode is also enabled if the variable is unset. Copying the environment example is optional for the default demo.

## Environment

| Variable             | Description                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`       | Reserved for future REST integration, for example `http://localhost:3000/api`. Not used by the current demo.           |
| `VITE_WS_URL`        | Reserved for future Socket.IO integration, for example `http://localhost:3000/realtime`. Not used by the current demo. |
| `VITE_USE_MOCK_DATA` | `true` or unset enables the local simulator. `false` disables mocks and shows an integration-not-available error.      |

Setting API URLs or disabling mocks does not connect the frontend to the backend. The API client and realtime integration still need to be implemented.

`VITE_*` variables are exposed to the browser. Do not put secrets in them. Restart Vite after changing environment settings.

## Scripts

| Command           | Description                           |
| ----------------- | ------------------------------------- |
| `pnpm dev`        | Start Vite in development mode        |
| `pnpm build`      | Type-check and build to `dist/`       |
| `pnpm preview`    | Preview the production build          |
| `pnpm lint`       | Run ESLint with zero warnings allowed |
| `pnpm lint:fix`   | Run ESLint and apply fixes            |
| `pnpm typecheck`  | Run TypeScript without emitting files |
| `pnpm format`     | Format source files with Prettier     |
| `pnpm test`       | Run unit and component tests once     |
| `pnpm test:watch` | Run tests in watch mode               |

## Mock data

The simulator lives in `src/data/mock/`:

- `fixtures.ts`: deterministic 24-hour telemetry, sessions, trials, commands, outages, and config snapshots
- `simulator.ts`: AUTO state machine `MAJU -> STOP -> PINDAI -> BELOK -> MAJU` plus MANUAL hold-to-move, timeout, and blocked-obstacle behavior
- `mock-api.ts`: in-memory store, interval simulation, command history, sessions/trials, analytics, and config updates

The simulator advances every 2 seconds. TanStack Query refreshes the dashboard every 2 seconds and the control page every 1.5 seconds while mock mode is active. These are local polling updates, not backend WebSocket events.

In AUTO, an explicit STOP pauses movement until START. While paused, PWM stays at 0 and distance retains its last value, so a flat chart is expected. START resumes the simulated AUTO cycle. Manual inactivity uses a 500 ms timeout threshold checked when the simulator advances; the demo is not a real-time firmware watchdog.

## Pages and demo workflow

| Page                                     | Purpose                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dashboard (`/`)                          | KPI cards, distance/PWM chart, quick START, control link, and recent events               |
| Kendali (`/control`)                     | Device status, main START/STOP panel, mode selection, manual control, and recent commands |
| Riwayat (`/history`)                     | Filter demo history and export CSV                                                        |
| Sesi Uji (`/sessions`, `/sessions/:sid`) | Create/end test sessions, record trial results, view summaries, and export session data   |
| Analisis (`/analytics`)                  | Inspect demo summaries with time, mode, and session filters                               |
| Konfigurasi (`/config`)                  | Change simulated distance thresholds and PWM limits with form validation                  |

### START, STOP, and modes

- The sticky global header keeps STOP visible and enabled on every page. There is no START in the header.
- START is available in Dashboard Perintah Cepat and the Kendali command panel. It is enabled only when the device is online, in AUTO, at STOP, and no START request is pending. An unavailable START has a visible explanation.
- STOP does not switch modes. If the device is in MANUAL, press STOP and switch to AUTO on Kendali before using START.
- Mode changes require the device to be online and stopped.
- Manual control only offers Maju, Kiri, Kanan, and Stop; there is no reverse button. Hold a direction to move; releasing, leaving, or cancelling the pointer sends a stop-direction message.
- Ambil kendali requests a simulated manual-control lock. Lepas kendali releases it and stops simulated movement without changing the mode. Entering MANUAL currently acquires the demo controller automatically; this is not a real multi-user lock service.
- Both the main STOP and the manual pad Stop remain enabled without a manual lock, including in AUTO or while offline. An enabled STOP is not a guarantee that a real device received or executed the command.

### Test sessions and configuration

A test session groups test conditions, configuration snapshots, and individual trial records for evaluation. Obstacle type/size are optional manual notes, not instructions for obstacle detection. Trial outcomes, including collisions, must be recorded by the tester; the demo does not automatically detect collisions. Starting or ending a test session does not start or stop the car.

Configuration changes the simulated STOP/resume distance thresholds and maximum motor PWM commands, including the manual PWM limit. PWM is not measured speed. These changes only affect the simulator and are lost on reload.

## Safety and integration limits

**STOP from the dashboard is not an emergency stop.** Real cloud commands can be delayed or fail. Physical testing requires a physical power switch and STOP button, with obstacle avoidance and safety decisions handled locally by ESP32 firmware.

This demo does not establish hardware safety or full compliance with the planned manual-control rules. Backend-enforced control ownership, realtime delivery/acknowledgements, firmware watchdogs, and real disconnect behavior still need integration and testing. Follow [`../docs/SAFETY_RULES.md`](../docs/SAFETY_RULES.md) before physical-car testing.

## Validation

From `frontend/`, run:

```powershell
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
```

For a manual demo check, run `pnpm dev` and verify AUTO STOP → START, MANUAL START restrictions, direction press/release, session records, configuration validation, and the header at a 375 px viewport. These steps are a validation checklist, not a claim that the tests have passed.

## Structure

```text
src/
  components/
    charts/       Recharts wrappers
    dashboard/    KPI cards, chart panel, quick commands, events table
    layout/       App shell, sidebar, header
    ui/           shadcn/ui primitives
  data/mock/      Fixtures, simulator, mock API
  hooks/          TanStack Query hooks for dashboard, control, history, sessions, analytics, config
  lib/            Analytics, CSV, formatting, session summaries, navigation, status styles
  pages/          Dashboard, control, history, sessions, analytics, config
  test/           Vitest setup
  types/          API types
```

## UI rules

- Design tokens are defined once in `src/index.css`.
- Status colors are mapped in `src/lib/status-style.ts`.
- Number and time formatting is handled in `src/lib/format.ts`.
- Follow `../docs/DESIGN.md`: no emoji, no gradients, and no ad-hoc colors in components.
