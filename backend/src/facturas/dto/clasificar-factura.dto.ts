import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ClasificacionOperacion } from '@prisma/client';

export class ClasificarFacturaDto {
  @IsUUID()
  clienteId!: string;

  @IsIn(['F606', 'F607'])
  formato!: 'F606' | 'F607';

  @IsOptional()
  @IsEnum(ClasificacionOperacion)
  clasificacionOperacion?: ClasificacionOperacion;
}
