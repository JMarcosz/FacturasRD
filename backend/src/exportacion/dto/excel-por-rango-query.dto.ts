import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ExcelPorRangoQueryDto {
  /** Opcional: sin cliente, el Excel sale multicliente (con columnas Cliente/RNC). */
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  // El formato sigue siendo obligatorio: 606 y 607 tienen juegos de columnas
  // distintos y el libro se genera con una sola hoja, así que "todos los
  // formatos" no cabe en un archivo.
  @IsIn(['F606', 'F607'])
  formato!: 'F606' | 'F607';

  @IsISO8601()
  desde!: string;

  @IsISO8601()
  hasta!: string;
}
