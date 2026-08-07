import { IsBoolean, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateFacturaDto {
  @IsOptional() @IsString() rncCedula?: string;
  @IsOptional() @IsString() tipoIdentificacion?: string;

  @IsOptional() @IsString() nombreEmisor?: string | null;
  @IsOptional() @IsString() identificacionEmisor?: string | null;
  @IsOptional() @IsString() nombreReceptor?: string | null;
  @IsOptional() @IsString() identificacionReceptor?: string | null;

  @IsOptional() @IsString() ncf?: string;
  @IsOptional() @IsString() ncfModificado?: string | null;
  @IsOptional() @IsISO8601() fechaComprobante?: string;
  @IsOptional() @IsISO8601() fechaRetencionOPago?: string | null;

  @IsOptional() @IsString() tipoIngreso?: string | null;
  @IsOptional() @IsString() tipoBienesServicios?: string | null;
  @IsOptional() @IsString() formaPago?: string | null;
  @IsOptional() @IsString() tipoRetencionISR?: string | null;

  @IsOptional() @IsNumber() montoFacturado?: number;
  @IsOptional() @IsNumber() itbisFacturado?: number;
  @IsOptional() @IsNumber() itbisRetenido?: number;
  @IsOptional() @IsNumber() itbisPercibido?: number;
  @IsOptional() @IsNumber() retencionRenta?: number;
  @IsOptional() @IsNumber() isrPercibido?: number;
  @IsOptional() @IsNumber() isc?: number;
  @IsOptional() @IsNumber() otrosImpuestos?: number;
  @IsOptional() @IsNumber() propinaLegal?: number;

  @IsOptional() @IsNumber() montoServicios?: number;
  @IsOptional() @IsNumber() montoBienes?: number;
  @IsOptional() @IsNumber() itbisSujetoProporcionalidad?: number;
  @IsOptional() @IsNumber() itbisLlevadoCosto?: number;
  @IsOptional() @IsNumber() itbisPorAdelantar?: number;

  @IsOptional() @IsNumber() montoEfectivo?: number;
  @IsOptional() @IsNumber() montoChequeTransferencia?: number;
  @IsOptional() @IsNumber() montoTarjeta?: number;
  @IsOptional() @IsNumber() montoVentaCredito?: number;
  @IsOptional() @IsNumber() montoBonos?: number;
  @IsOptional() @IsNumber() montoPermuta?: number;
  @IsOptional() @IsNumber() montoOtrasFormas?: number;

  @IsOptional() @IsBoolean() revisada?: boolean;
}
