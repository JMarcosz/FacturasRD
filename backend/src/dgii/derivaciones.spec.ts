import Decimal from 'decimal.js';
import {
  FORMAS_VENTA_607,
  clasificarFormaPago606,
  clasificarFormaVenta607,
  derivarFactura606,
  derivarFactura607,
  distribuirFormaVenta607,
} from './derivaciones';
import type { ConfiguracionCliente, FacturaExtraida } from './types';

function hechosBase(overrides: Partial<FacturaExtraida> = {}): FacturaExtraida {
  return {
    rncEmisor: '130123454',
    nombreEmisor: 'Proveedor SRL',
    rncReceptor: '101929933',
    nombreReceptor: 'Cliente SRL',
    ncf: 'B0100000001',
    ncfModificado: null,
    fechaEmision: '2026-07-15',
    fechaVencimientoNcf: null,
    montoGravado: '1000.00',
    montoExento: '0.00',
    itbis: '180.00',
    isc: '0.00',
    propinaLegal: '0.00',
    otrosImpuestos: '0.00',
    montoTotal: '1180.00',
    moneda: 'DOP',
    tasaCambio: null,
    formaPagoImpresa: null,
    condicionPago: null,
    lineas: [],
    ...overrides,
  };
}

const clienteConTipoIngreso: ConfiguracionCliente = {
  rnc: '130111111',
  tipoIngresoDefault: '01',
  tasaItbis: new Decimal('0.18'),
  aplicaProporcionalidad: false,
};

describe('derivarFactura607', () => {
  it('calcula montoFacturado, usa el RNC del receptor y el tipoIngreso del cliente', () => {
    const { factura, avisos } = derivarFactura607(hechosBase(), clienteConTipoIngreso);
    expect(factura.rncCedula).toBe('101929933');
    expect(factura.tipoIdentificacion).toBe('1');
    expect(factura.montoFacturado.toFixed(2)).toBe('1000.00');
    expect(factura.tipoIngreso).toBe('01');
    expect(avisos.find((a) => a.campo === 'tipoIngreso')).toBeUndefined();
  });

  it('avisa cuando el cliente no tiene tipoIngresoDefault', () => {
    const clienteSinTipo: ConfiguracionCliente = { ...clienteConTipoIngreso, tipoIngresoDefault: null };
    const { factura, avisos } = derivarFactura607(hechosBase(), clienteSinTipo);
    expect(factura.tipoIngreso).toBe('');
    expect(avisos.some((a) => a.campo === 'tipoIngreso')).toBe(true);
  });

  it('distribuye el total en Efectivo cuando el texto impreso lo indica', () => {
    const { factura, avisos } = derivarFactura607(hechosBase({ formaPagoImpresa: 'Pagado en EFECTIVO' }), clienteConTipoIngreso);
    expect(factura.montoEfectivo.toFixed(2)).toBe('1180.00');
    expect(factura.montoOtrasFormas.toFixed(2)).toBe('0.00');
    expect(avisos.some((a) => a.campo === 'formaVenta')).toBe(false);
  });

  it('avisa y deja la distribución en cero cuando no hay señal de forma de pago', () => {
    const { factura, avisos } = derivarFactura607(hechosBase(), clienteConTipoIngreso);
    const total = factura.montoEfectivo
      .plus(factura.montoChequeTransferencia)
      .plus(factura.montoTarjeta)
      .plus(factura.montoVentaCredito)
      .plus(factura.montoBonos)
      .plus(factura.montoPermuta)
      .plus(factura.montoOtrasFormas);
    expect(total.toFixed(2)).toBe('0.00');
    expect(avisos.some((a) => a.campo === 'formaVenta')).toBe(true);
  });

  it('deriva montoFacturado del total cuando no hay desglose gravado/exento', () => {
    const hechos = hechosBase({ montoGravado: null, montoExento: null, montoTotal: '1180.00', itbis: '180.00' });
    const { factura } = derivarFactura607(hechos, clienteConTipoIngreso);
    expect(factura.montoFacturado.toFixed(2)).toBe('1000.00');
  });

  it('avisa cuando falta el RNC/Cédula del comprador', () => {
    const { avisos } = derivarFactura607(hechosBase({ rncReceptor: null }), clienteConTipoIngreso);
    expect(avisos.some((a) => a.campo === 'rncCedula')).toBe(true);
  });
});

describe('derivarFactura606', () => {
  it('usa el RNC del emisor (proveedor) y por defecto asigna todo a Servicios', () => {
    const { factura, avisos } = derivarFactura606(hechosBase(), clienteConTipoIngreso);
    expect(factura.rncCedula).toBe('130123454');
    expect(factura.montoServicios.toFixed(2)).toBe('1000.00');
    expect(factura.montoBienes.toFixed(2)).toBe('0.00');
    expect(avisos.some((a) => a.campo === 'tipoBienesServicios')).toBe(true);
  });

  it('asigna Nota de Crédito (06) como forma de pago cuando el NCF es de nota de crédito', () => {
    const { factura } = derivarFactura606(hechosBase({ ncf: 'B0400000001', ncfModificado: 'B0100000001' }), clienteConTipoIngreso);
    expect(factura.formaPago).toBe('06');
  });

  it('avisa sobre proporcionalidad cuando el cliente la aplica', () => {
    const clienteProp: ConfiguracionCliente = { ...clienteConTipoIngreso, aplicaProporcionalidad: true };
    const { avisos } = derivarFactura606(hechosBase(), clienteProp);
    expect(avisos.some((a) => a.campo === 'itbisSujetoProporcionalidad')).toBe(true);
  });
});

describe('clasificarFormaVenta607', () => {
  it('detecta tarjeta antes que crédito cuando dice "tarjeta de crédito"', () => {
    expect(clasificarFormaVenta607({ formaPagoImpresa: 'Tarjeta de crédito', condicionPago: null })).toBe('TARJETA');
  });
  it('detecta venta a crédito con términos de días', () => {
    expect(clasificarFormaVenta607({ formaPagoImpresa: null, condicionPago: 'Neto 30 días' })).toBe('VENTA_CREDITO');
  });
  it('devuelve null sin texto', () => {
    expect(clasificarFormaVenta607({ formaPagoImpresa: null, condicionPago: null })).toBeNull();
  });
});

describe('clasificarFormaPago606', () => {
  it('detecta transferencia', () => {
    expect(clasificarFormaPago606({ formaPagoImpresa: 'Transferencia bancaria', condicionPago: null })).toBe('02');
  });
});

describe('distribuirFormaVenta607', () => {
  const COLUMNAS = {
    EFECTIVO: 'montoEfectivo',
    CHEQUE_TRANSFERENCIA: 'montoChequeTransferencia',
    TARJETA: 'montoTarjeta',
    VENTA_CREDITO: 'montoVentaCredito',
    BONOS: 'montoBonos',
    PERMUTA: 'montoPermuta',
    OTRAS_FORMAS: 'montoOtrasFormas',
  } as const;

  it.each(FORMAS_VENTA_607)('pone el total en la columna de %s y deja las otras en cero', (forma) => {
    const total = new Decimal('1180.00');
    const distribucion = distribuirFormaVenta607(forma, total);

    expect(distribucion[COLUMNAS[forma]].toString()).toBe('1180');
    const otras = Object.entries(distribucion).filter(([campo]) => campo !== COLUMNAS[forma]);
    for (const [, monto] of otras) expect(monto.isZero()).toBe(true);
  });

  it('la suma de las 7 columnas siempre iguala el total — es lo que valida DESCUADRE_607', () => {
    const total = new Decimal('1180.00');
    for (const forma of FORMAS_VENTA_607) {
      const suma = Object.values(distribuirFormaVenta607(forma, total)).reduce(
        (acc, monto) => acc.plus(monto),
        new Decimal(0),
      );
      expect(suma.equals(total)).toBe(true);
    }
  });

  it('coincide con lo que deriva la extracción automática, para que el TXT no dependa del camino', () => {
    const { factura } = derivarFactura607(
      hechosBase({ formaPagoImpresa: 'Efectivo', rncReceptor: '101929933' }),
      clienteConTipoIngreso,
    );
    const total = factura.montoFacturado.plus(factura.itbisFacturado);
    const distribucion = distribuirFormaVenta607('EFECTIVO', total);

    expect(factura.montoEfectivo.equals(distribucion.montoEfectivo)).toBe(true);
    expect(factura.montoTarjeta.equals(distribucion.montoTarjeta)).toBe(true);
  });
});
