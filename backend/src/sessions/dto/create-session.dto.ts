import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const sessionTypes = [
  'SENSOR',
  'PENGHINDARAN',
  'JARAK_BERHENTI',
  'DAYA',
  'KONEKSI_PUTUS',
  'STOP',
] as const;

export type SessionType = (typeof sessionTypes)[number];

export class CreateSessionDto {
  @IsIn(sessionTypes, { message: 'type must be a valid session type' })
  type!: SessionType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  obstacleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  obstacleSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  floorSurface?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  laneWidthCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  batteryLevel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  pwmSetting?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
