import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { FORMAS_VENTA_607 } from '../../dgii';
import type { FormaVenta607 } from '../../dgii';

/**
 * Solo campos de clasificación. La lista está acotada a propósito: ninguno de
 * estos entra en la clave `rncCedula:ncf`, lo que permite calcular los NCF ya
 * declarados una vez por lote en vez de una por fila. NCF, fechas y montos
 * siguen siendo edición de a una.
 */
export class CamposLoteDto {
  @IsOptional() @IsString() tipoBienesServicios?: string;
  @IsOptional() @IsString() formaPago?: string;
  @IsOptional() @IsString() tipoIngreso?: string;
  @IsOptional() @IsString() tipoRetencionISR?: string;

  /**
   * Forma de venta del 607. No es una columna de la tabla: se traduce, fila
   * por fila, a la distribución de los 7 montos (`montoEfectivo`…) usando el
   * total de ESA factura. Por eso viaja como enum y no como importe — un lote
   * comparte la forma de cobro, nunca el monto.
   */
  @IsOptional() @IsIn(FORMAS_VENTA_607) formaVenta?: FormaVenta607;
}

export class LoteCamposDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  // `@ValidateNested()` + `@Type()` no son decorativos: sin ese par el
  // ValidationPipe global no desciende al objeto anidado y sus claves llegan
  // sin filtrar hasta Prisma.
  @IsOptional()
  @ValidateNested()
  @Type(() => CamposLoteDto)
  cambios?: CamposLoteDto;

  /** Reclasificación opcional: van juntos o no van (606 y 607 no comparten campos). */
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsIn(['F606', 'F607'])
  formato?: 'F606' | 'F607';
}
