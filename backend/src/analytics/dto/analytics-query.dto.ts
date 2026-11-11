import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Matches, Max, Min } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'sessionId must be a positive integer' })
  sessionId?: string;

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'], { message: 'mode must be AUTO or MANUAL' })
  mode?: 'AUTO' | 'MANUAL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  marginCm?: number;
}
