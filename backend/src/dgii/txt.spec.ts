import Decimal from 'decimal.js';
import { generarLinea606, generarLinea607, generarTxt607 } from './txt';
import type { FacturaDgii606, FacturaDgii607 } from './types';

const factura607: FacturaDgii607 = {
  rncCedula: '101929933',
  tipoIdentificacion: '1',
  ncf: 'B0100000001',
  ncfModificado: null,
  fechaComprobante: new Date('2026-07-15T00:00:00.000Z'),
  fechaRetencionOPago: null,
  montoFacturado: new Decimal('1000.5'),
  itbisFacturado: new Decimal('180.09'),
  itbisRetenido: new Decimal(0),
  itbisPercibido: new Decimal(0),
  retencionRenta: new Decimal(0),
  isrPercibido: new Decimal(0),
  isc: new Decimal(0),
  otrosImpuestos: new Decimal(0),
  propinaLegal: new Decimal(0),
  tipoIngreso: '01',
  montoEfectivo: new Decimal('1180.59'),
  montoChequeTransferencia: new Decimal(0),
  montoTarjeta: new Decimal(0),
  montoVentaCredito: new Decimal(0),
  montoBonos: new Decimal(0),
  montoPermuta: new Decimal(0),
  montoOtrasFormas: new Decimal(0),
};

describe('generarLinea607', () => {
  it('produce 23 campos separados por |', () => {
    const linea = generarLinea607(factura607);
    expect(linea.split('|')).toHaveLength(23);
  });

  it('formatea la fecha como AAAAMMDD y los montos con 2 decimales', () => {
    const linea = generarLinea607(factura607);
    const campos = linea.split('|');
    expect(campos[5]).toBe('20260715'); // Fecha Comprobante
    expect(campos[7]).toBe('1000.50'); // Monto Facturado
    expect(campos[8]).toBe('180.09'); // ITBIS Facturado
  });

  it('deja vacío el NCF Modificado cuando es null', () => {
    const campos = generarLinea607(factura607).split('|');
    expect(campos[3]).toBe('');
  });
});

describe('generarTxt607', () => {
  it('antepone el encabezado RNC|Periodo|CantidadRegistros y usa CRLF', () => {
    const txt = generarTxt607('130111111', '202607', [factura607, factura607]);
    const lineas = txt.split('\r\n');
    expect(lineas[0]).toBe('130111111|202607|2');
    expect(lineas).toHaveLength(4); // encabezado + 2 facturas + línea final vacía
    expect(lineas[3]).toBe('');
  });
});

describe('generarLinea606', () => {
  it('produce 23 campos y termina con la Forma de Pago', () => {
    const factura606: FacturaDgii606 = {
      rncCedula: '130123454',
      tipoIdentificacion: '1',
      ncf: 'B0100000001',
      ncfModificado: null,
      fechaComprobante: new Date('2026-07-15T00:00:00.000Z'),
      fechaRetencionOPago: null,
      montoFacturado: new Decimal('1000.00'),
      itbisFacturado: new Decimal('180.00'),
      itbisRetenido: new Decimal(0),
      itbisPercibido: new Decimal(0),
      retencionRenta: new Decimal(0),
      isrPercibido: new Decimal(0),
      isc: new Decimal(0),
      otrosImpuestos: new Decimal(0),
      propinaLegal: new Decimal(0),
      tipoBienesServicios: '02',
      formaPago: '01',
      tipoRetencionISR: null,
      montoServicios: new Decimal('1000.00'),
      montoBienes: new Decimal(0),
      itbisSujetoProporcionalidad: new Decimal(0),
      itbisLlevadoCosto: new Decimal(0),
      itbisPorAdelantar: new Decimal(0),
    };
    const campos = generarLinea606(factura606).split('|');
    expect(campos).toHaveLength(23);
    expect(campos[22]).toBe('01');
  });
});
