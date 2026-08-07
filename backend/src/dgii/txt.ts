import Decimal from 'decimal.js';
import type { FacturaDgii606, FacturaDgii607 } from './types';

/**
 * IMPORTANTE: el orden de columnas de detalle está confirmado contra la
 * respuesta oficial de la DGII (ficha de ayuda CA3839, formato 606) y contra
 * la enumeración de campos del 607. El formato del ENCABEZADO (RNC|Período|
 * CantidadRegistros) y detalles finos como separador de línea o padding NO
 * se pudieron verificar contra la Norma 07-18 original. Antes de usar esto
 * para una declaración real: generar un archivo con datos ya enviados y
 * exitosos, y comparar byte a byte (ver "test de oro" en el plan).
 */

const SEPARADOR_CAMPO = '|';
const SEPARADOR_LINEA = '\r\n';

function fechaAAAAMMDD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function monto(d: Decimal): string {
  return d.toFixed(2);
}

function opcional(v: string | null): string {
  return v ?? '';
}

function fechaOpcional(v: Date | null): string {
  return v ? fechaAAAAMMDD(v) : '';
}

export function generarEncabezado(rncDeclarante: string, yyyymm: string, cantidadRegistros: number): string {
  return [rncDeclarante, yyyymm, String(cantidadRegistros)].join(SEPARADOR_CAMPO);
}

export function generarLinea607(f: FacturaDgii607): string {
  return [
    f.rncCedula,
    f.tipoIdentificacion,
    f.ncf,
    opcional(f.ncfModificado),
    f.tipoIngreso,
    fechaAAAAMMDD(f.fechaComprobante),
    fechaOpcional(f.fechaRetencionOPago),
    monto(f.montoFacturado),
    monto(f.itbisFacturado),
    monto(f.itbisRetenido),
    monto(f.itbisPercibido),
    monto(f.retencionRenta),
    monto(f.isrPercibido),
    monto(f.isc),
    monto(f.otrosImpuestos),
    monto(f.propinaLegal),
    monto(f.montoEfectivo),
    monto(f.montoChequeTransferencia),
    monto(f.montoTarjeta),
    monto(f.montoVentaCredito),
    monto(f.montoBonos),
    monto(f.montoPermuta),
    monto(f.montoOtrasFormas),
  ].join(SEPARADOR_CAMPO);
}

export function generarLinea606(f: FacturaDgii606): string {
  return [
    f.rncCedula,
    f.tipoIdentificacion,
    f.tipoBienesServicios,
    f.ncf,
    opcional(f.ncfModificado),
    fechaAAAAMMDD(f.fechaComprobante),
    fechaOpcional(f.fechaRetencionOPago),
    monto(f.montoServicios),
    monto(f.montoBienes),
    monto(f.montoFacturado),
    monto(f.itbisFacturado),
    monto(f.itbisRetenido),
    monto(f.itbisSujetoProporcionalidad),
    monto(f.itbisLlevadoCosto),
    monto(f.itbisPorAdelantar),
    monto(f.itbisPercibido),
    opcional(f.tipoRetencionISR),
    monto(f.retencionRenta),
    monto(f.isrPercibido),
    monto(f.isc),
    monto(f.otrosImpuestos),
    monto(f.propinaLegal),
    f.formaPago,
  ].join(SEPARADOR_CAMPO);
}

export function generarTxt607(rncDeclarante: string, yyyymm: string, facturas: FacturaDgii607[]): string {
  const lineas = [generarEncabezado(rncDeclarante, yyyymm, facturas.length), ...facturas.map(generarLinea607)];
  return lineas.join(SEPARADOR_LINEA) + SEPARADOR_LINEA;
}

export function generarTxt606(rncDeclarante: string, yyyymm: string, facturas: FacturaDgii606[]): string {
  const lineas = [generarEncabezado(rncDeclarante, yyyymm, facturas.length), ...facturas.map(generarLinea606)];
  return lineas.join(SEPARADOR_LINEA) + SEPARADOR_LINEA;
}
