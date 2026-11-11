import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class ExportTelemetryQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'], { message: 'mode must be AUTO or MANUAL' })
  mode?: string;
}

export class ExportEventsQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;
}

export class ExportCommandsQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;
}
