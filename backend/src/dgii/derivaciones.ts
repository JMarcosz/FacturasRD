import Decimal from 'decimal.js';
import { detectarTipoIdentificacion, limpiarIdentificacion } from './rnc';
import { esNotaCredito } from './ncf';
import type {
  AvisoDerivacion,
  ConfiguracionCliente,
  FacturaDgii606,
  FacturaDgii607,
  FacturaExtraida,
} from './types';

export function dec(valor: string | null | undefined): Decimal {
  if (valor === null || valor === undefined || valor.trim() === '') return new Decimal(0);
  const limpio = valor.replace(/[^0-9.-]/g, '');
  if (limpio === '' || limpio === '-') return new Decimal(0);
  try {
    return new Decimal(limpio);
  } catch {
    return new Decimal(0);
  }
}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Monto Facturado = subtotal antes de impuestos (gravado + exento). */
export function calcularMontoFacturado(h: FacturaExtraida): Decimal {
  const explicito = dec(h.montoGravado).plus(dec(h.montoExento));
  if (explicito.gt(0)) return explicito;
  // Sin desglose de gravado/exento en el documento: derivarlo del total.
  const total = dec(h.montoTotal);
  const impuestos = dec(h.itbis).plus(dec(h.isc)).plus(dec(h.otrosImpuestos)).plus(dec(h.propinaLegal));
  const resultado = total.minus(impuestos);
  return resultado.gt(0) ? resultado : total;
}

const PALABRAS_EFECTIVO = ['efectivo', 'cash', 'contado'];
const PALABRAS_TRANSFERENCIA = ['transferencia', 'deposito', 'depósito', 'cheque'];
const PALABRAS_TARJETA = ['tarjeta', 'tdc', 'tdd', 'card'];
const PALABRAS_CREDITO = ['credito', 'crédito', 'dias', 'días', 'neto'];
const PALABRAS_BONO = ['bono', 'certificado de regalo', 'gift card'];
const PALABRAS_PERMUTA = ['permuta'];

function contieneAlguna(texto: string, palabras: string[]): boolean {
  const t = texto.toLowerCase();
  return palabras.some((p) => t.includes(p));
}

/**
 * Las 7 columnas de forma de venta del 607. `OTRAS_FORMAS` nunca la deduce
 * `clasificarFormaVenta607` (no hay texto impreso que la implique): existe
 * para que el contador pueda elegirla explícitamente, incluso en lote.
 */
export type FormaVenta607 =
  | 'EFECTIVO'
  | 'CHEQUE_TRANSFERENCIA'
  | 'TARJETA'
  | 'VENTA_CREDITO'
  | 'BONOS'
  | 'PERMUTA'
  | 'OTRAS_FORMAS';

export const FORMAS_VENTA_607: readonly FormaVenta607[] = [
  'EFECTIVO',
  'CHEQUE_TRANSFERENCIA',
  'TARJETA',
  'VENTA_CREDITO',
  'BONOS',
  'PERMUTA',
  'OTRAS_FORMAS',
] as const;

export interface DistribucionFormaVenta607 {
  montoEfectivo: Decimal;
  montoChequeTransferencia: Decimal;
  montoTarjeta: Decimal;
  montoVentaCredito: Decimal;
  montoBonos: Decimal;
  montoPermuta: Decimal;
  montoOtrasFormas: Decimal;
}

/**
 * Pone el total (monto facturado + ITBIS) íntegro en la columna elegida y deja
 * las otras seis en cero. Es la operación que el 607 llama «forma de venta»:
 * no es un campo aparte, es en cuál de las 7 columnas cae el importe.
 *
 * Se comparte entre la derivación automática y la asignación en lote para que
 * ambas produzcan exactamente la misma fila — si divergen, el TXT sale
 * distinto según por dónde pasó la factura.
 */
export function distribuirFormaVenta607(forma: FormaVenta607, total: Decimal): DistribucionFormaVenta607 {
  const cero = new Decimal(0);
  const distribucion: DistribucionFormaVenta607 = {
    montoEfectivo: cero,
    montoChequeTransferencia: cero,
    montoTarjeta: cero,
    montoVentaCredito: cero,
    montoBonos: cero,
    montoPermuta: cero,
    montoOtrasFormas: cero,
  };
  switch (forma) {
    case 'EFECTIVO':
      distribucion.montoEfectivo = total;
      break;
    case 'CHEQUE_TRANSFERENCIA':
      distribucion.montoChequeTransferencia = total;
      break;
    case 'TARJETA':
      distribucion.montoTarjeta = total;
      break;
    case 'VENTA_CREDITO':
      distribucion.montoVentaCredito = total;
      break;
    case 'BONOS':
      distribucion.montoBonos = total;
      break;
    case 'PERMUTA':
      distribucion.montoPermuta = total;
      break;
    case 'OTRAS_FORMAS':
      distribucion.montoOtrasFormas = total;
      break;
  }
  return distribucion;
}

/**
 * Intenta clasificar la forma de venta a partir del texto impreso en la
 * factura (forma de pago / condición de pago). Si no hay una señal clara,
 * devuelve null — la app NO debe adivinar en qué columna de las 7 va el
 * monto total; eso lo decide el contador en la pantalla de revisión.
 */
export function clasificarFormaVenta607(
  h: Pick<FacturaExtraida, 'formaPagoImpresa' | 'condicionPago'>,
): FormaVenta607 | null {
  const texto = `${h.formaPagoImpresa ?? ''} ${h.condicionPago ?? ''}`.trim();
  if (texto === '') return null;
  if (contieneAlguna(texto, PALABRAS_TARJETA)) return 'TARJETA';
  if (contieneAlguna(texto, PALABRAS_TRANSFERENCIA)) return 'CHEQUE_TRANSFERENCIA';
  if (contieneAlguna(texto, PALABRAS_BONO)) return 'BONOS';
  if (contieneAlguna(texto, PALABRAS_PERMUTA)) return 'PERMUTA';
  if (contieneAlguna(texto, PALABRAS_CREDITO)) return 'VENTA_CREDITO';
  if (contieneAlguna(texto, PALABRAS_EFECTIVO)) return 'EFECTIVO';
  return null;
}

type FormaPago606 = '01' | '02' | '03' | '04' | '05' | null;

export function clasificarFormaPago606(h: Pick<FacturaExtraida, 'formaPagoImpresa' | 'condicionPago'>): FormaPago606 {
  const texto = `${h.formaPagoImpresa ?? ''} ${h.condicionPago ?? ''}`.trim();
  if (texto === '') return null;
  if (contieneAlguna(texto, PALABRAS_TARJETA)) return '03';
  if (contieneAlguna(texto, PALABRAS_TRANSFERENCIA)) return '02';
  if (contieneAlguna(texto, PALABRAS_PERMUTA)) return '05';
  if (contieneAlguna(texto, PALABRAS_CREDITO)) return '04';
  if (contieneAlguna(texto, PALABRAS_EFECTIVO)) return '01';
  return null;
}

export interface ResultadoDerivacion<T> {
  factura: T;
  avisos: AvisoDerivacion[];
}

/** Deriva los campos del Formato 607 (Ventas) a partir de los hechos extraídos. */
export function derivarFactura607(
  hechos: FacturaExtraida,
  cliente: ConfiguracionCliente,
): ResultadoDerivacion<Omit<FacturaDgii607, 'fechaComprobante'> & { fechaComprobante: Date | null }> {
  const avisos: AvisoDerivacion[] = [];

  const rncCedula = limpiarIdentificacion(hechos.rncReceptor);
  const montoFacturado = calcularMontoFacturado(hechos);
  const itbisFacturado = dec(hechos.itbis);
  const fechaComprobante = fecha(hechos.fechaEmision);
  const tieneRetencion = dec(hechos.itbis).gt(0) && false; // reservado: hoy no derivamos retención de terceros automáticamente

  if (!rncCedula) {
    avisos.push({ campo: 'rncCedula', mensaje: 'No se detectó el RNC/Cédula del comprador en el documento.' });
  }
  if (!fechaComprobante) {
    avisos.push({ campo: 'fechaComprobante', mensaje: 'No se detectó la fecha del comprobante.' });
  }

  // '01' (Ingresos por operaciones) es el tipo más común — mejor ese default
  // que dejarlo vacío y bloquear la factura hasta que alguien lo asigne a mano.
  const tipoIngreso = cliente.tipoIngresoDefault ?? '01';
  if (!cliente.tipoIngresoDefault) {
    avisos.push({
      campo: 'tipoIngreso',
      mensaje:
        'El cliente no tiene un Tipo de Ingreso configurado por defecto; se usó "01 - Ingresos por operaciones" — verifica que sea correcto.',
    });
  }

  const forma = clasificarFormaVenta607(hechos);
  const totalConImpuesto = montoFacturado.plus(itbisFacturado);
  const distribucion = forma
    ? distribuirFormaVenta607(forma, totalConImpuesto)
    : distribuirFormaVenta607('OTRAS_FORMAS', new Decimal(0));
  if (!forma) {
    avisos.push({
      campo: 'formaVenta',
      mensaje: 'No se pudo determinar la forma de venta a partir del documento; debe distribuirse manualmente.',
    });
  }

  const factura = {
    rncCedula,
    tipoIdentificacion: detectarTipoIdentificacion(rncCedula),
    ncf: (hechos.ncf ?? '').trim().toUpperCase(),
    ncfModificado: hechos.ncfModificado ? hechos.ncfModificado.trim().toUpperCase() : null,
    fechaComprobante,
    fechaRetencionOPago: tieneRetencion ? fechaComprobante : null,
    montoFacturado,
    itbisFacturado,
    itbisRetenido: new Decimal(0),
    itbisPercibido: new Decimal(0),
    retencionRenta: new Decimal(0),
    isrPercibido: new Decimal(0),
    isc: dec(hechos.isc),
    otrosImpuestos: dec(hechos.otrosImpuestos),
    propinaLegal: dec(hechos.propinaLegal),
    tipoIngreso,
    ...distribucion,
  };

  return { factura, avisos };
}

/** Deriva los campos del Formato 606 (Compras y Gastos) a partir de los hechos extraídos. */
export function derivarFactura606(
  hechos: FacturaExtraida,
  cliente: ConfiguracionCliente,
): ResultadoDerivacion<Omit<FacturaDgii606, 'fechaComprobante'> & { fechaComprobante: Date | null }> {
  const avisos: AvisoDerivacion[] = [];

  const rncCedula = limpiarIdentificacion(hechos.rncEmisor);
  const montoFacturado = calcularMontoFacturado(hechos);
  const fechaComprobante = fecha(hechos.fechaEmision);
  const ncf = (hechos.ncf ?? '').trim().toUpperCase();

  if (!rncCedula) {
    avisos.push({ campo: 'rncCedula', mensaje: 'No se detectó el RNC/Cédula del proveedor en el documento.' });
  }
  if (!fechaComprobante) {
    avisos.push({ campo: 'fechaComprobante', mensaje: 'No se detectó la fecha del comprobante.' });
  }

  avisos.push({
    campo: 'tipoBienesServicios',
    mensaje: 'Clasificación de bienes/servicios pendiente de asignar por el contador.',
  });
  avisos.push({
    campo: 'montoServicios',
    mensaje: 'Por defecto el monto completo se asignó a Servicios; ajustar el desglose Bienes/Servicios si aplica.',
  });
  if (cliente.aplicaProporcionalidad) {
    avisos.push({
      campo: 'itbisSujetoProporcionalidad',
      mensaje: 'El cliente aplica proporcionalidad (Art. 349); confirmar si el ITBIS de esta compra debe distribuirse.',
    });
  }

  let formaPago: string | null = esNotaCredito(ncf) ? '06' : clasificarFormaPago606(hechos);
  if (!formaPago) {
    avisos.push({
      campo: 'formaPago',
      mensaje: 'No se pudo determinar la forma de pago a partir del documento; debe asignarse manualmente.',
    });
  }

  const factura = {
    rncCedula,
    tipoIdentificacion: detectarTipoIdentificacion(rncCedula),
    ncf,
    ncfModificado: hechos.ncfModificado ? hechos.ncfModificado.trim().toUpperCase() : null,
    fechaComprobante,
    fechaRetencionOPago: null,
    montoFacturado,
    itbisFacturado: dec(hechos.itbis),
    itbisRetenido: new Decimal(0),
    itbisPercibido: new Decimal(0),
    retencionRenta: new Decimal(0),
    isrPercibido: new Decimal(0),
    isc: dec(hechos.isc),
    otrosImpuestos: dec(hechos.otrosImpuestos),
    propinaLegal: dec(hechos.propinaLegal),
    tipoBienesServicios: '',
    formaPago: formaPago ?? '',
    tipoRetencionISR: null,
    montoServicios: montoFacturado,
    montoBienes: new Decimal(0),
    itbisSujetoProporcionalidad: new Decimal(0),
    itbisLlevadoCosto: new Decimal(0),
    itbisPorAdelantar: new Decimal(0),
  };

  return { factura, avisos };
}
