import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * A diferencia de `ExcelPorRangoQueryDto`, sin `formato`: el volcado completo
 * no distingue 606 de 607 ni exige que la factura ya tenga uno — es una sola
 * hoja con todo, clasificado o no.
 */
export class ExcelCompletoQueryDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsISO8601()
  desde!: string;

  @IsISO8601()
  hasta!: string;
}
