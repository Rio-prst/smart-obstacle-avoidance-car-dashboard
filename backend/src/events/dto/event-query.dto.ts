import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EventQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  mode?: 'AUTO' | 'MANUAL';

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
  @Max(200)
  limit?: number;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'cursor must be a positive integer' })
  cursor?: string;
}
