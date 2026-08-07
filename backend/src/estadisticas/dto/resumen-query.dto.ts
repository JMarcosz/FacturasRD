import { IsOptional, IsUUID, Matches } from 'class-validator';

export class ResumenQueryDto {
  /** Mes a resumir, "AAAAMM". Si falta, el mes en curso (UTC). */
  @IsOptional()
  @Matches(/^\d{4}(0[1-9]|1[0-2])$/, { message: 'yyyymm debe tener el formato AAAAMM.' })
  yyyymm?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;
}
