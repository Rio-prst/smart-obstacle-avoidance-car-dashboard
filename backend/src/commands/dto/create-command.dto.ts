import { IsIn, IsOptional } from 'class-validator';

export class CreateCommandDto {
  @IsIn(['START', 'STOP', 'SET_MODE'], { message: 'cmd must be START, STOP, or SET_MODE' })
  cmd!: 'START' | 'STOP' | 'SET_MODE';

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'], { message: 'mode must be AUTO or MANUAL' })
  mode?: 'AUTO' | 'MANUAL';
}
