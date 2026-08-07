import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { FormatoDgii } from '@prisma/client';

export class CreateReglaDto {
  @IsString()
  @IsNotEmpty()
  rnc: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  clienteId?: string;

  @IsString()
  @IsOptional()
  formato?: FormatoDgii;

  @IsString()
  @IsOptional()
  tipoIngreso?: string;

  @IsString()
  @IsOptional()
  formaVenta?: string;

  @IsString()
  @IsOptional()
  tipoBienesServicios?: string;

  @IsString()
  @IsOptional()
  formaPago?: string;
}
