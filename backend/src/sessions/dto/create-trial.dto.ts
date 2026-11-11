import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTrialDto {
  @IsOptional()
  @IsIn(['SUCCESS', 'COLLISION', 'FAIL'], { message: 'result must be SUCCESS, COLLISION, or FAIL' })
  result?: 'SUCCESS' | 'COLLISION' | 'FAIL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(400)
  refDistanceCm?: number;

  @IsOptional()
  @IsBoolean()
  captureSensor?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(80)
  @Max(255)
  pwm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(400)
  stoppingDistanceCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60000)
  stopLatencyMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
