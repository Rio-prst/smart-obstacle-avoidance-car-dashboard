-- CreateTable
CREATE TABLE "test_sessions" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "obstacle_type" TEXT,
    "obstacle_size" TEXT,
    "floor_surface" TEXT,
    "lane_width_cm" INTEGER,
    "battery_level" TEXT,
    "pwm_setting" INTEGER,
    "config_snapshot" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,

    CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_trials" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "trial_no" INTEGER NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "ref_distance_cm" REAL,
    "measured_cm" REAL,
    "valid" BOOLEAN,
    "pwm" SMALLINT,
    "stopping_distance_cm" REAL,
    "stop_latency_ms" INTEGER,
    "note" TEXT,

    CONSTRAINT "test_trials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_sessions_device_id_started_at_idx" ON "test_sessions"("device_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "test_sessions_device_id_status_idx" ON "test_sessions"("device_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "test_sessions_one_running_per_device" ON "test_sessions"("device_id") WHERE "status" = 'running';

-- CreateIndex
CREATE INDEX "test_trials_session_id_trial_no_idx" ON "test_trials"("session_id", "trial_no");

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_trials" ADD CONSTRAINT "test_trials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
