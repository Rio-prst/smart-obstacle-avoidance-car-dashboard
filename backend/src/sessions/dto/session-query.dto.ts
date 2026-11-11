import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { sessionTypes } from './create-session.dto';

export class SessionQueryDto {
  @IsOptional()
  @IsIn(sessionTypes, { message: 'type must be a valid session type' })
  type?: string;

  @IsOptional()
  @IsIn(['running', 'ended'], { message: 'status must be running or ended' })
  status?: 'running' | 'ended';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'cursor must be a positive integer' })
  cursor?: string;
}
