import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ListarFacturasQueryDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsIn(['F606', 'F607'])
  formato?: 'F606' | 'F607';

  @IsOptional()
  @IsIn(['sin_clasificar', 'clasificada'])
  estado?: 'sin_clasificar' | 'clasificada';

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;
}
