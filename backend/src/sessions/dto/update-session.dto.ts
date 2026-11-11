import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSessionDto {
  @IsOptional()
  @IsIn(['ended'], { message: 'status can only be set to ended' })
  status?: 'ended';

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
