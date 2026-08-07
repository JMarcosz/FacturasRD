import { calcularDigitoVerificadorRnc } from '../dgii/rnc';
import { buscarFormaPago, buscarIdentificaciones, buscarItbis, buscarNcf } from './patrones-rd';

function rncValido(base8: string): string {
  return base8 + String(calcularDigitoVerificadorRnc(base8));
}

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

  it('encuentra RNCs etiquetados y los valida por dígito verificador', () => {
    const texto = `Empresa Emisora SRL\nRNC: ${rnc1}\n\nSeñor(es): Cliente Final\nRNC: ${rnc2}`;
    expect(buscarIdentificaciones(texto)).toEqual([rnc1, rnc2]);
  });

  it('descarta números etiquetados como RNC que no pasan el dígito verificador', () => {
    const texto = `RNC: 999999999`;
    expect(buscarIdentificaciones(texto)).toEqual([]);
  });

  it('ignora números que no están cerca de una etiqueta RNC/Cédula', () => {
    const texto = `Teléfono: ${rnc1}`;
    expect(buscarIdentificaciones(texto)).toEqual([]);
  });
});

describe('buscarItbis', () => {
  it('extrae el monto de ITBIS etiquetado', () => {
    expect(buscarItbis('Subtotal 1,000.00\nITBIS 18%   180.00\nTotal 1,180.00')).toBe('180.00');
  });

  it('devuelve null si no aparece la palabra ITBIS', () => {
    expect(buscarItbis('Subtotal 1,000.00\nTax 180.00')).toBeNull();
  });

  it('no confunde el encabezado de una tabla ("ITBIS PRECIO TOTAL") con un monto, en texto sin saltos de línea reales', () => {
    // Caso real: Gemini devuelve el texto "aplanado" (sin newlines de la
    // grilla del recibo), a diferencia del OCR geométrico de Document
    // Intelligence. Antes de este fix, el regex saltaba "PRECIO TOTAL" y
    // capturaba la cantidad "1.0" de la primera línea de producto.
    const texto =
      'CANT PRODUCTO ITBIS PRECIO TOTAL 1.0 agua bon E 0.00 25.00 25.00 SUBTOTAL 25.00 ITBIS 0.00 TOTAL 25.00';
    expect(buscarItbis(texto)).toBe('0.00');
  });
});

describe('buscarFormaPago', () => {
  it('encuentra "efectivo" en el texto de un recibo', () => {
    expect(buscarFormaPago('TOTAL 25.00\nEFECTIVO 500.00\nCAMBIO 475.00')).toBe('efectivo');
  });

  it('encuentra "tarjeta"', () => {
    expect(buscarFormaPago('Pago con TARJETA de crédito')).toBe('tarjeta');
  });

  it('encuentra "transferencia" o "depósito"', () => {
    expect(buscarFormaPago('Pagado por transferencia bancaria')).toBe('transferencia');
    expect(buscarFormaPago('Depósito No. 12345')).toBe('transferencia');
  });

  it('devuelve null si no hay ninguna palabra reconocible', () => {
    expect(buscarFormaPago('Gracias por su compra')).toBeNull();
  });
});
