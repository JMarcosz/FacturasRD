import ExcelJS from 'exceljs';
import type { FacturaDgii606, FacturaDgii607 } from './types';

const ENCABEZADOS_607 = [
  'RNC/Cédula/Pasaporte',
  'Tipo Identificación',
  'Número Comprobante Fiscal',
  'Número Comprobante Fiscal Modificado',
  'Tipo de Ingreso',
  'Fecha Comprobante',
  'Fecha de Retención',
  'Monto Facturado',
  'ITBIS Facturado',
  'ITBIS Retenido por Terceros',
  'ITBIS Percibido',
  'Retención Renta por Terceros',
  'ISR Percibido',
  'Impuesto Selectivo al Consumo',
  'Otros Impuestos/Tasas',
  'Monto Propina Legal',
  'Efectivo',
  'Cheque/Transferencia/Depósito',
  'Tarjeta Débito/Crédito',
  'Venta a Crédito',
  'Bonos o Certificados de Regalo',
  'Permuta',
  'Otras Formas de Ventas',
] as const;

const ENCABEZADOS_606 = [
  'RNC/Cédula',
  'Tipo ID',
  'Tipo Bienes y Servicios Comprados',
  'NCF',
  'NCF o Documento Modificado',
  'Fecha Comprobante',
  'Fecha Pago',
  'Servicios',
  'Bienes',
  'Monto Facturado',
  'ITBIS Facturado',
  'ITBIS Retenido',
  'ITBIS Sujeto a Proporcionalidad',
  'ITBIS Llevado al Costo',
  'ITBIS por Adelantar',
  'ITBIS Percibido en Compras',
  'Tipo de Retención',
  'Retención Renta',
  'ISR Percibido en Compras',
  'Impuesto Selectivo al Consumo',
  'Otros Impuestos/Tasas',
  'Monto Propina Legal',
  'Forma de Pago',
] as const;

function fechaExcel(d: Date): Date {
  return d;
}

async function libroConHoja(nombreHoja: string, encabezados: readonly string[], filas: unknown[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja);
  hoja.addRow([...encabezados]);
  hoja.getRow(1).font = { bold: true };
  for (const fila of filas) hoja.addRow(fila);
  hoja.columns.forEach((columna) => {
    columna.width = 20;
  });
  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generarExcel607(facturas: FacturaDgii607[]): Promise<Buffer> {
  const filas = facturas.map((f) => [
    f.rncCedula,
    f.tipoIdentificacion,
    f.ncf,
    f.ncfModificado ?? '',
    f.tipoIngreso,
    fechaExcel(f.fechaComprobante),
    f.fechaRetencionOPago ? fechaExcel(f.fechaRetencionOPago) : '',
    f.montoFacturado.toNumber(),
    f.itbisFacturado.toNumber(),
    f.itbisRetenido.toNumber(),
    f.itbisPercibido.toNumber(),
    f.retencionRenta.toNumber(),
    f.isrPercibido.toNumber(),
    f.isc.toNumber(),
    f.otrosImpuestos.toNumber(),
    f.propinaLegal.toNumber(),
    f.montoEfectivo.toNumber(),
    f.montoChequeTransferencia.toNumber(),
    f.montoTarjeta.toNumber(),
    f.montoVentaCredito.toNumber(),
    f.montoBonos.toNumber(),
    f.montoPermuta.toNumber(),
    f.montoOtrasFormas.toNumber(),
  ]);
  return libroConHoja('607', ENCABEZADOS_607, filas);
}

export function generarExcel606(facturas: FacturaDgii606[]): Promise<Buffer> {
  const filas = facturas.map((f) => [
    f.rncCedula,
    f.tipoIdentificacion,
    f.tipoBienesServicios,
    f.ncf,
    f.ncfModificado ?? '',
    fechaExcel(f.fechaComprobante),
    f.fechaRetencionOPago ? fechaExcel(f.fechaRetencionOPago) : '',
    f.montoServicios.toNumber(),
    f.montoBienes.toNumber(),
    f.montoFacturado.toNumber(),
    f.itbisFacturado.toNumber(),
    f.itbisRetenido.toNumber(),
    f.itbisSujetoProporcionalidad.toNumber(),
    f.itbisLlevadoCosto.toNumber(),
    f.itbisPorAdelantar.toNumber(),
    f.itbisPercibido.toNumber(),
    f.tipoRetencionISR ?? '',
    f.retencionRenta.toNumber(),
    f.isrPercibido.toNumber(),
    f.isc.toNumber(),
    f.otrosImpuestos.toNumber(),
    f.propinaLegal.toNumber(),
    f.formaPago,
  ]);
  return libroConHoja('606', ENCABEZADOS_606, filas);
}

// ── Variantes multicliente ────────────────────────────────────────────────
//
// Solo para el Excel de consulta interna por rango de fechas, cuando no se
// filtra por un cliente: sin las columnas Cliente/RNC las filas de distintos
// contribuyentes serían indistinguibles.
//
// Son generadores HERMANOS a propósito. `generarExcel606`/`generarExcel607`
// producen el archivo que se le entrega a la DGII y su layout tiene que
// quedar byte-exacto: no se les añade ninguna columna.

/** Datos del contribuyente que declara, no de la contraparte (esa ya va en `rncCedula`). */
export interface DatosClienteFila {
  clienteNombre: string;
  clienteRnc: string;
}

const ENCABEZADOS_CLIENTE = ['Cliente', 'RNC Cliente'] as const;

export function generarExcel607Multicliente(facturas: Array<FacturaDgii607 & DatosClienteFila>): Promise<Buffer> {
  const filas = facturas.map((f) => [
    f.clienteNombre,
    f.clienteRnc,
    f.rncCedula,
    f.tipoIdentificacion,
    f.ncf,
    f.ncfModificado ?? '',
    f.tipoIngreso,
    fechaExcel(f.fechaComprobante),
    f.fechaRetencionOPago ? fechaExcel(f.fechaRetencionOPago) : '',
    f.montoFacturado.toNumber(),
    f.itbisFacturado.toNumber(),
    f.itbisRetenido.toNumber(),
    f.itbisPercibido.toNumber(),
    f.retencionRenta.toNumber(),
    f.isrPercibido.toNumber(),
    f.isc.toNumber(),
    f.otrosImpuestos.toNumber(),
    f.propinaLegal.toNumber(),
    f.montoEfectivo.toNumber(),
    f.montoChequeTransferencia.toNumber(),
    f.montoTarjeta.toNumber(),
    f.montoVentaCredito.toNumber(),
    f.montoBonos.toNumber(),
    f.montoPermuta.toNumber(),
    f.montoOtrasFormas.toNumber(),
  ]);
  return libroConHoja('607', [...ENCABEZADOS_CLIENTE, ...ENCABEZADOS_607], filas);
}

export function generarExcel606Multicliente(facturas: Array<FacturaDgii606 & DatosClienteFila>): Promise<Buffer> {
  const filas = facturas.map((f) => [
    f.clienteNombre,
    f.clienteRnc,
    f.rncCedula,
    f.tipoIdentificacion,
    f.tipoBienesServicios,
    f.ncf,
    f.ncfModificado ?? '',
    fechaExcel(f.fechaComprobante),
    f.fechaRetencionOPago ? fechaExcel(f.fechaRetencionOPago) : '',
    f.montoServicios.toNumber(),
    f.montoBienes.toNumber(),
    f.montoFacturado.toNumber(),
    f.itbisFacturado.toNumber(),
    f.itbisRetenido.toNumber(),
    f.itbisSujetoProporcionalidad.toNumber(),
    f.itbisLlevadoCosto.toNumber(),
    f.itbisPorAdelantar.toNumber(),
    f.itbisPercibido.toNumber(),
    f.tipoRetencionISR ?? '',
    f.retencionRenta.toNumber(),
    f.isrPercibido.toNumber(),
    f.isc.toNumber(),
    f.otrosImpuestos.toNumber(),
    f.propinaLegal.toNumber(),
    f.formaPago,
  ]);
  return libroConHoja('606', [...ENCABEZADOS_CLIENTE, ...ENCABEZADOS_606], filas);
}
