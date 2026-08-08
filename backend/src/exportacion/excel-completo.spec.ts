import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { generarExcelCompleto } from './excel-completo';

/** Solo los campos que `generarExcelCompleto` realmente lee. */
function factura(overrides: Record<string, unknown> = {}) {
  return {
    nombreEmisor: 'MINIMARKET CONTRERAS',
    identificacionEmisor: '132001095',
    nombreReceptor: null,
    identificacionReceptor: null,
    ncf: 'B0200850537',
    ncfModificado: null,
    fechaComprobante: new Date('2026-01-02'),
    fechaRetencionOPago: null,
    montoFacturado: new Decimal('822.68'),
    itbisFacturado: new Decimal('148.12'),
    itbisRetenido: new Decimal(0),
    itbisPercibido: new Decimal(0),
    retencionRenta: new Decimal(0),
    isrPercibido: new Decimal(0),
    isc: new Decimal(0),
    otrosImpuestos: new Decimal(0),
    propinaLegal: new Decimal(0),
    cliente: null,
    formato: null,
    clasificacionConfirmada: false,
    validaciones: [],
    ...overrides,
  } as any;
}

async function leerFilas(buffer: Buffer): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as any);
  const hoja = libro.getWorksheet('Facturas')!;
  const filas: string[][] = [];
  hoja.eachRow((fila) => {
    filas.push(fila.values ? (fila.values as unknown[]).slice(1).map((v) => String(v ?? '')) : []);
  });
  return filas;
}

describe('generarExcelCompleto', () => {
  it('incluye una factura sin clasificar — a diferencia de excel-rango, que las excluye a propósito', async () => {
    const buffer = await generarExcelCompleto([factura()]);
    const filas = await leerFilas(buffer);
    expect(filas).toHaveLength(2); // encabezado + 1 factura
    const fila = filas[1];
    expect(fila).toContain('MINIMARKET CONTRERAS');
    expect(fila).toContain('— sin clasificar —');
  });

  it('vuelca el cliente y formato asignados cuando la factura ya está clasificada', async () => {
    const buffer = await generarExcelCompleto([
      factura({
        cliente: { nombre: 'MINIMARKET CONTRERAS', rnc: '132001095' },
        formato: 'F607',
        identificacionReceptor: '40215828936',
      }),
    ]);
    const filas = await leerFilas(buffer);
    const fila = filas[1];
    expect(fila).toContain('F607');
    expect(fila).toContain('40215828936');
  });

  it('cuenta errores y advertencias de validación por separado', async () => {
    const buffer = await generarExcelCompleto([
      factura({
        validaciones: [
          { severidad: 'ERROR' },
          { severidad: 'ERROR' },
          { severidad: 'WARNING' },
        ],
      }),
    ]);
    const filas = await leerFilas(buffer);
    const encabezados = filas[0];
    const fila = filas[1];
    expect(fila[encabezados.indexOf('Errores de Validación')]).toBe('2');
    expect(fila[encabezados.indexOf('Advertencias de Validación')]).toBe('1');
  });

  it('sin facturas, solo queda el encabezado', async () => {
    const buffer = await generarExcelCompleto([]);
    const filas = await leerFilas(buffer);
    expect(filas).toHaveLength(1);
  });
});
