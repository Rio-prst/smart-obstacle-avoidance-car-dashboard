import { IsInt, Max, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsInt()
  @Min(15)
  @Max(100)
  stopCm!: number;

  @IsInt()
  @Min(18)
  @Max(150)
  resumeCm!: number;

  @IsInt()
  @Min(80)
  @Max(255)
  maxPwm!: number;

  @IsInt()
  @Min(80)
  @Max(180)
  manualMaxPwm!: number;
}
