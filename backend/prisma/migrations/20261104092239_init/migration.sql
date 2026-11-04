-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'AUTO',
    "state" TEXT NOT NULL DEFAULT 'STOP',
    "last_seen" TIMESTAMPTZ(6),
    "fw" TEXT,
    "last_cmd_seq" INTEGER NOT NULL DEFAULT 0,
    "control_epoch" INTEGER NOT NULL DEFAULT 0,
    "control_user_id" UUID,
    "control_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "mode" TEXT NOT NULL,
    "dist_cm" REAL,
    "valid" BOOLEAN NOT NULL,
    "state" TEXT NOT NULL,
    "pwm" SMALLINT NOT NULL,
    "avoid_count" INTEGER NOT NULL,
    "rssi" SMALLINT,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "mode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DEVICE',
    "type" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commands" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "cmd" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "exp" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acked_at" TIMESTAMPTZ(6),

    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_config" (
    "device_id" TEXT NOT NULL,
    "ver" INTEGER NOT NULL DEFAULT 1,
    "stop_cm" INTEGER NOT NULL DEFAULT 25,
    "resume_cm" INTEGER NOT NULL DEFAULT 30,
    "max_pwm" INTEGER NOT NULL DEFAULT 200,
    "manual_max_pwm" INTEGER NOT NULL DEFAULT 150,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_config_pkey" PRIMARY KEY ("device_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "telemetry_device_id_ts_idx" ON "telemetry"("device_id", "ts" DESC);

-- CreateIndex
CREATE INDEX "telemetry_device_id_mode_ts_idx" ON "telemetry"("device_id", "mode", "ts" DESC);

-- CreateIndex
CREATE INDEX "events_device_id_ts_idx" ON "events"("device_id", "ts" DESC);

-- CreateIndex
CREATE INDEX "events_device_id_type_ts_idx" ON "events"("device_id", "type", "ts" DESC);

-- CreateIndex
CREATE INDEX "commands_device_id_created_at_idx" ON "commands"("device_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "commands_device_id_seq_key" ON "commands"("device_id", "seq");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_control_user_id_fkey" FOREIGN KEY ("control_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_config" ADD CONSTRAINT "device_config_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
