import { EstadoPeriodo } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePeriodoEstadoDto {
  @IsEnum(EstadoPeriodo)
  estado!: EstadoPeriodo;
}
