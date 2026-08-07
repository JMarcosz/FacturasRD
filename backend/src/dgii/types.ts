/**
 * Tipos del módulo dgii/. Este módulo no depende de NestJS ni de Prisma:
 * trabaja con strings y Decimal de decimal.js, y se testea sin base de datos.
 */
import Decimal from 'decimal.js';

export type Formato = 'F606' | 'F607';

export type TipoIdentificacion = '1' | '2' | '3'; // RNC | Cédula | Pasaporte

/**
 * Hechos que Azure AI Content Understanding extrae directamente de la imagen
 * del documento. Deliberadamente NO incluye ninguna clasificación fiscal
 * (tipo de ingreso, forma de venta, etc.) — esas se derivan en código.
 */
export interface FacturaExtraida {
  rncEmisor: string | null;
  nombreEmisor: string | null;
  rncReceptor: string | null;
  nombreReceptor: string | null;
  ncf: string | null;
  ncfModificado: string | null;
  fechaEmision: string | null; // ISO yyyy-mm-dd
  fechaVencimientoNcf?: string | null;
  montoGravado: string | null; // strings porque vienen de JSON de Azure
  montoExento: string | null;
  itbis: string | null;
  isc: string | null;
  propinaLegal: string | null;
  otrosImpuestos: string | null;
  montoTotal: string | null;
  moneda?: string | null;
  tasaCambio?: string | null;
  formaPagoImpresa: string | null;
  condicionPago: string | null;
  lineas?: Array<{
    descripcion: string | null;
    cantidad: string | null;
    precioUnitario: string | null;
    importe: string | null;
  }>;
}

/** Configuración fiscal del cliente (contribuyente que declara). */
export interface ConfiguracionCliente {
  rnc: string;
  tipoIngresoDefault: string | null;
  tasaItbis: Decimal;
  aplicaProporcionalidad: boolean;
}

export interface AvisoDerivacion {
  campo: string;
  mensaje: string;
}

/** Campos DGII comunes a 606 y 607, ya derivados y listos para validar/exportar. */
export interface FacturaDgiiBase {
  rncCedula: string;
  tipoIdentificacion: TipoIdentificacion;
  ncf: string;
  ncfModificado: string | null;
  fechaComprobante: Date;
  fechaRetencionOPago: Date | null;
  montoFacturado: Decimal;
  itbisFacturado: Decimal;
  itbisRetenido: Decimal;
  itbisPercibido: Decimal;
  retencionRenta: Decimal;
  isrPercibido: Decimal;
  isc: Decimal;
  otrosImpuestos: Decimal;
  propinaLegal: Decimal;
}

export interface FacturaDgii607 extends FacturaDgiiBase {
  tipoIngreso: string;
  montoEfectivo: Decimal;
  montoChequeTransferencia: Decimal;
  montoTarjeta: Decimal;
  montoVentaCredito: Decimal;
  montoBonos: Decimal;
  montoPermuta: Decimal;
  montoOtrasFormas: Decimal;
}

export interface FacturaDgii606 extends FacturaDgiiBase {
  tipoBienesServicios: string;
  formaPago: string;
  tipoRetencionISR: string | null;
  montoServicios: Decimal;
  montoBienes: Decimal;
  itbisSujetoProporcionalidad: Decimal;
  itbisLlevadoCosto: Decimal;
  itbisPorAdelantar: Decimal;
}

export type Severidad = 'ERROR' | 'WARNING';

export interface ResultadoValidacion {
  codigo: string;
  severidad: Severidad;
  campo: string | null;
  mensaje: string;
}

/** Contexto adicional que las validaciones necesitan y que no vive en la propia factura. */
export interface ContextoValidacion {
  yyyymm: string; // período declarado, "202601"
  ncfsYaDeclarados: ReadonlySet<string>; // claves `${rnc}:${ncf}` de este período y anteriores
  tasaItbis: Decimal;
  confidences?: Record<string, number>;
  umbralConfianza?: number; // default 0.85
}
