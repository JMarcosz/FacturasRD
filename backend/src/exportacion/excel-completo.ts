import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import type { Factura, Cliente, Validacion } from '@prisma/client';
import { describirTipoNcf, identificacionDeclarada } from '../dgii';

/**
 * Volcado de consulta con TODO lo extraído — a diferencia de
 * `generarExcel606/607` (byte-exactos para la DGII) y de `excel-rango` (exige
 * un formato y excluye a propósito las facturas sin clasificar), este incluye
 * cualquier factura del rango, tenga o no cliente y formato asignados. Sirve
 * para auditar qué leyó la IA, no para declarar.
 */
type FacturaConRelaciones = Factura & {
  cliente: Pick<Cliente, 'nombre' | 'rnc'> | null;
  validaciones: Pick<Validacion, 'severidad'>[];
};

const ENCABEZADOS = [
  'Emisor (comercio)',
  'RNC/Cédula Emisor',
  'Receptor (cliente)',
  'RNC/Cédula Receptor',
  'NCF',
  'Tipo de NCF',
  'NCF Modificado',
  'Fecha Comprobante',
  'Fecha Retención/Pago',
  'Monto Facturado',
  'ITBIS Facturado',
  'ITBIS Retenido',
  'ITBIS Percibido',
  'Retención Renta',
  'ISR Percibido',
  'ISC',
  'Otros Impuestos',
  'Propina Legal',
  'Cliente Asignado',
  'RNC Cliente Asignado',
  'Formato',
  'RNC/Cédula Declarado (derivado)',
  'Clasificación Confirmada',
  'Errores de Validación',
  'Advertencias de Validación',
] as const;

function numero(valor: Prisma.Decimal | null): number {
  return valor ? Number(valor.toString()) : 0;
}

export async function generarExcelCompleto(facturas: FacturaConRelaciones[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Facturas');
  hoja.addRow([...ENCABEZADOS]);
  hoja.getRow(1).font = { bold: true };

  for (const f of facturas) {
    const errores = f.validaciones.filter((v) => v.severidad === 'ERROR').length;
    const advertencias = f.validaciones.filter((v) => v.severidad === 'WARNING').length;
    hoja.addRow([
      f.nombreEmisor ?? '',
      f.identificacionEmisor ?? '',
      f.nombreReceptor ?? '',
      f.identificacionReceptor ?? '',
      f.ncf,
      describirTipoNcf(f.ncf)?.descripcion ?? '',
      f.ncfModificado ?? '',
      f.fechaComprobante ?? '',
      f.fechaRetencionOPago ?? '',
      numero(f.montoFacturado),
      numero(f.itbisFacturado),
      numero(f.itbisRetenido),
      numero(f.itbisPercibido),
      numero(f.retencionRenta),
      numero(f.isrPercibido),
      numero(f.isc),
      numero(f.otrosImpuestos),
      numero(f.propinaLegal),
      f.cliente?.nombre ?? '— sin clasificar —',
      f.cliente?.rnc ?? '',
      f.formato ?? '—',
      identificacionDeclarada(f.formato, f) || '',
      f.clasificacionConfirmada ? 'Sí' : 'No',
      errores,
      advertencias,
    ]);
  }

  hoja.columns.forEach((columna) => {
    columna.width = 20;
  });

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
