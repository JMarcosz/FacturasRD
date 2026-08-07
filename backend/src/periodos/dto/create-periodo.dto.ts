import { FormatoDgii } from '@prisma/client';
import { IsEnum, IsUUID, Matches } from 'class-validator';

export class CreatePeriodoDto {
  @IsUUID()
  clienteId!: string;

  @Matches(/^\d{4}(0[1-9]|1[0-2])$/, { message: 'yyyymm debe tener formato AAAAMM, ej. 202607.' })
  yyyymm!: string;

  @IsEnum(FormatoDgii)
  formato!: FormatoDgii;
}
