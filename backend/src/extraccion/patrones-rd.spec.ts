import { calcularDigitoVerificadorCedula, calcularDigitoVerificadorRnc } from '../dgii/rnc';
import {
  buscarFechaFirmaOEmision,
  buscarFormaPago,
  buscarIdentificaciones,
  buscarItbis,
  buscarNcf,
  normalizarNcfOcr,
} from './patrones-rd';

function rncValido(base8: string): string {
  return base8 + String(calcularDigitoVerificadorRnc(base8));
}

function cedulaValida(base10: string): string {
  return base10 + String(calcularDigitoVerificadorCedula(base10));
}

describe('normalizarNcfOcr', () => {
  it('autocorrige confusión de OCR de 8 por B inicial', () => {
    expect(normalizarNcfOcr('80100001301')).toBe('B0100001301');
    expect(normalizarNcfOcr('80200000045')).toBe('B0200000045');
    expect(normalizarNcfOcr('81400000001')).toBe('B1400000001');
  });

  it('autocorrige confusión de F por E inicial en e-CF rellenando ceros si faltan', () => {
    expect(normalizarNcfOcr('F310000258502')).toBe('E310000258502');
    expect(normalizarNcfOcr('F31258502')).toBe('E310000258502');
  });
});

describe('buscarNcf', () => {
  it('encuentra un NCF etiquetado explícitamente', () => {
    const texto = 'Factura de venta\nNCF: B0100000123\nFecha: 03/08/2026';
    expect(buscarNcf(texto)).toBe('B0100000123');
  });

  it('encuentra un e-CF etiquetado como "Comprobante Fiscal"', () => {
    const texto = 'Comprobante Fiscal No. E310000000045';
    expect(buscarNcf(texto)).toBe('E310000000045');
  });

  it('cae al patrón libre cuando no hay etiqueta reconocible', () => {
    const texto = 'Documento sin etiqueta clara B0400000009 en el cuerpo';
    expect(buscarNcf(texto)).toBe('B0400000009');
  });

  it('devuelve null cuando no hay ningún patrón de NCF', () => {
    expect(buscarNcf('Factura sin número reconocible 177664')).toBeNull();
  });

  it('encuentra el NCF con ceros de relleno pegados a la letra (recibo POS real)', () => {
    const texto =
      'Factura para consumidor final\nNCF 00000000B0200467854\n*** LLEVAR ***\nFACTURA ORDEN\n177664 161';
    expect(buscarNcf(texto)).toBe('B0200467854');
  });

  it('encuentra el NCF de relleno aunque no haya etiqueta "NCF" reconocible', () => {
    const texto = 'Texto sin etiqueta 00000000E310000000045 en el cuerpo';
    expect(buscarNcf(texto)).toBe('E310000000045');
  });
});

describe('buscarIdentificaciones', () => {
  const rnc1 = rncValido('13012345');
  const rnc2 = rncValido('10192993');
  const cedula1 = cedulaValida('0010192993');

  it('encuentra RNCs etiquetados y los valida por dígito verificador', () => {
    const texto = `Empresa Emisora SRL\nRNC: ${rnc1}\n\nSeñor(es): Cliente Final\nRNC: ${rnc2}`;
    expect(buscarIdentificaciones(texto)).toEqual([rnc1, rnc2]);
  });

  it('encuentra RNCs con guiones y formatos dominicanos comunes', () => {
    // 1-30-12345-4 o 130-12345-4
    const rncConGuiones = `${rnc1.slice(0, 1)}-${rnc1.slice(1, 3)}-${rnc1.slice(3, 8)}-${rnc1.slice(8)}`;
    const texto = `SUPLIDORA MARCOR\nRNC / CÉDULA: ${rncConGuiones}`;
    expect(buscarIdentificaciones(texto)).toEqual([rnc1]);
  });

  it('encuentra Cédulas con guiones y las valida', () => {
    const cedulaConGuiones = `${cedula1.slice(0, 3)}-${cedula1.slice(3, 10)}-${cedula1.slice(10)}`;
    const texto = `CLIENTE CONSUMIDOR\nCédula: ${cedulaConGuiones}`;
    const ids = buscarIdentificaciones(texto);
    expect(ids).toContain(cedula1);
  });

  it('descarta números que no pasan el dígito verificador', () => {
    const texto = `RNC: 999999999`;
    expect(buscarIdentificaciones(texto)).toEqual([]);
  });
});

describe('buscarFechaFirmaOEmision', () => {
  it('extrae fecha del sello de firma digital en factura electrónica e-CF', () => {
    const texto = `Factura Electrónica e-CF\nNCF: E310000604671\nFecha y hora de firma: 14/08/2026 15:45:10\nSello digital: ABCD1234`;
    expect(buscarFechaFirmaOEmision(texto)).toBe('2026-08-14');
  });

  it('extrae fecha de emisión general cuando no hay firma', () => {
    const texto = `SUPERMERCADO NACIONAL\nFecha de Emisión: 03/05/2026\nNCF: B0100000137`;
    expect(buscarFechaFirmaOEmision(texto)).toBe('2026-05-03');
  });

  it('extrae fecha en formato YYYY-MM-DD', () => {
    const texto = `Firmado digitalmente: 2026-11-20T08:00:00`;
    expect(buscarFechaFirmaOEmision(texto)).toBe('2026-11-20');
  });
});

describe('buscarItbis', () => {
  it('encuentra el monto de ITBIS cuando está precedido por la etiqueta', () => {
    const texto = 'Subtotal 1,000.00\nITBIS 18% 180.00\nTotal 1,180.00';
    expect(buscarItbis(texto)).toBe('180.00');
  });

  it('maneja ITBIS sin el símbolo de porcentaje', () => {
    const texto = 'Subtotal: 1000.00\nITBIS: 180.00\nTotal: 1180.00';
    expect(buscarItbis(texto)).toBe('180.00');
  });

  it('devuelve null cuando no hay mención de ITBIS', () => {
    expect(buscarItbis('Total 500.00 sin impuestos desglosados')).toBeNull();
  });
});

describe('buscarFormaPago', () => {
  it('detecta efectivo', () => {
    expect(buscarFormaPago('PAGO EN EFECTIVO 500.00')).toBe('efectivo');
  });

  it('detecta tarjeta', () => {
    expect(buscarFormaPago('TARJETA VISA *1234')).toBe('tarjeta');
  });

  it('detecta transferencia', () => {
    expect(buscarFormaPago('TRANSFERENCIA BANCARIA')).toBe('transferencia');
  });

  it('devuelve null cuando no hay ninguna forma de pago reconocible', () => {
    expect(buscarFormaPago('TOTAL A PAGAR: 500.00')).toBeNull();
  });
});
