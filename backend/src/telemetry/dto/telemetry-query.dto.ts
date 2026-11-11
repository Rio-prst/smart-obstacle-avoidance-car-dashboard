import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TelemetryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  @IsOptional()
  @IsIn(['1s', '5s', '30s', '1m'])
  interval?: '1s' | '5s' | '30s' | '1m';

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  mode?: 'AUTO' | 'MANUAL';
}
