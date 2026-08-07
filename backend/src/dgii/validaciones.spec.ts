import Decimal from 'decimal.js';
import { validarFactura606, validarFactura607 } from './validaciones';
import { calcularDigitoVerificadorRnc } from './rnc';
import type { ContextoValidacion, FacturaDgii606, FacturaDgii607 } from './types';

function rncValido(base8: string): string {
  return base8 + String(calcularDigitoVerificadorRnc(base8));
}

const RNC_OK = rncValido('10192993');

function factura607Base(overrides: Partial<FacturaDgii607> = {}): Omit<FacturaDgii607, 'fechaComprobante'> & { fechaComprobante: Date | null } {
  return {
    rncCedula: RNC_OK,
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
    tipoIngreso: '01',
    montoEfectivo: new Decimal('1180.00'),
    montoChequeTransferencia: new Decimal(0),
    montoTarjeta: new Decimal(0),
    montoVentaCredito: new Decimal(0),
    montoBonos: new Decimal(0),
    montoPermuta: new Decimal(0),
    montoOtrasFormas: new Decimal(0),
    ...overrides,
  };
}

const contextoBase: ContextoValidacion = {
  yyyymm: '202607',
  ncfsYaDeclarados: new Set(),
  tasaItbis: new Decimal('0.18'),
};

describe('validarFactura607', () => {
  it('no reporta errores para una factura consistente', () => {
    const resultados = validarFactura607(factura607Base(), contextoBase);
    expect(resultados.filter((r) => r.severidad === 'ERROR')).toHaveLength(0);
  });

  it('reporta RNC_INVALIDO cuando el dígito verificador no cuadra', () => {
    const resultados = validarFactura607(factura607Base({ rncCedula: '999999999' }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'RNC_INVALIDO')).toBe(true);
  });

  it('reporta NCF_DUPLICADO cuando la clave rnc:ncf ya fue declarada', () => {
    const contexto: ContextoValidacion = { ...contextoBase, ncfsYaDeclarados: new Set([`${RNC_OK}:B0100000001`]) };
    const resultados = validarFactura607(factura607Base(), contexto);
    expect(resultados.some((r) => r.codigo === 'NCF_DUPLICADO')).toBe(true);
  });

  it('reporta NC_SIN_MODIFICADO en una nota de crédito sin NCF modificado', () => {
    const resultados = validarFactura607(factura607Base({ ncf: 'B0400000001', ncfModificado: null }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'NC_SIN_MODIFICADO')).toBe(true);
  });

  it('reporta CLASIFICACION_FALTANTE cuando no hay tipoIngreso', () => {
    const resultados = validarFactura607(factura607Base({ tipoIngreso: '' }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'CLASIFICACION_FALTANTE' && r.campo === 'tipoIngreso')).toBe(true);
  });

  it('reporta FORMA_VENTA_INDEFINIDA cuando las 7 columnas están en cero pero hay monto', () => {
    const resultados = validarFactura607(
      factura607Base({ montoEfectivo: new Decimal(0) }),
      contextoBase,
    );
    expect(resultados.some((r) => r.codigo === 'FORMA_VENTA_INDEFINIDA')).toBe(true);
  });

  it('reporta ITBIS_INCONSISTENTE cuando el ITBIS no cuadra con la tasa del cliente', () => {
    const resultados = validarFactura607(factura607Base({ itbisFacturado: new Decimal('50.00') }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'ITBIS_INCONSISTENTE')).toBe(true);
  });

  it('reporta FECHA_FUERA_PERIODO cuando la fecha no cae en el período declarado', () => {
    const resultados = validarFactura607(
      factura607Base({ fechaComprobante: new Date('2026-01-01T00:00:00.000Z') }),
      contextoBase,
    );
    expect(resultados.some((r) => r.codigo === 'FECHA_FUERA_PERIODO')).toBe(true);
  });

  it('reporta BAJA_CONFIANZA para campos bajo el umbral', () => {
    const contexto: ContextoValidacion = { ...contextoBase, confidences: { ncf: 0.5 } };
    const resultados = validarFactura607(factura607Base(), contexto);
    expect(resultados.some((r) => r.codigo === 'BAJA_CONFIANZA' && r.campo === 'ncf')).toBe(true);
  });

  it('NO reporta IDENTIFICACION_FALTANTE cuando el NCF es tipo 02 (Consumo) y no hay RNC/Cédula', () => {
    const resultados = validarFactura607(factura607Base({ rncCedula: '', ncf: 'B0200000001' }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'IDENTIFICACION_FALTANTE')).toBe(false);
  });

  it('SÍ reporta IDENTIFICACION_FALTANTE si falta RNC/Cédula con un NCF que no es de Consumo', () => {
    const resultados = validarFactura607(factura607Base({ rncCedula: '', ncf: 'B0100000001' }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'IDENTIFICACION_FALTANTE')).toBe(true);
  });
});

function factura606Base(overrides: Partial<FacturaDgii606> = {}): Omit<FacturaDgii606, 'fechaComprobante'> & { fechaComprobante: Date | null } {
  return {
    rncCedula: RNC_OK,
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
    ...overrides,
  };
}

describe('validarFactura606', () => {
  it('no reporta errores para una factura consistente', () => {
    const resultados = validarFactura606(factura606Base(), contextoBase);
    expect(resultados.filter((r) => r.severidad === 'ERROR')).toHaveLength(0);
  });

  it('reporta CLASIFICACION_FALTANTE cuando falta tipoBienesServicios o formaPago', () => {
    const resultados = validarFactura606(factura606Base({ tipoBienesServicios: '', formaPago: '' }), contextoBase);
    expect(resultados.filter((r) => r.codigo === 'CLASIFICACION_FALTANTE')).toHaveLength(2);
  });

  it('reporta DESCUADRE_606 cuando Servicios + Bienes no cuadra con Monto Facturado', () => {
    const resultados = validarFactura606(factura606Base({ montoServicios: new Decimal('500.00') }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'DESCUADRE_606')).toBe(true);
  });

  it('SÍ reporta IDENTIFICACION_FALTANTE en 606 aunque el NCF sea tipo 02 (la excepción es solo para 607)', () => {
    const resultados = validarFactura606(factura606Base({ rncCedula: '', ncf: 'B0200000001' }), contextoBase);
    expect(resultados.some((r) => r.codigo === 'IDENTIFICACION_FALTANTE')).toBe(true);
  });
});
