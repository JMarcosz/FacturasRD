import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class HistorialQueryDto {
  // `@Type(() => Number)` no es opcional: el ValidationPipe global transforma
  // pero no tiene `enableImplicitConversion`, así que sin esto el valor llega
  // como string y `@IsInt()` responde 400.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  desplazamiento?: number;
}
