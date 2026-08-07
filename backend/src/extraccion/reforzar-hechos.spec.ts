import { calcularDigitoVerificadorRnc } from '../dgii/rnc';
import { reforzarConPatrones } from './reforzar-hechos';
import type { FacturaExtraida } from '../dgii';

function rncValido(base8: string): string {
  return base8 + String(calcularDigitoVerificadorRnc(base8));
}

function hechosBase(overrides: Partial<FacturaExtraida> = {}): FacturaExtraida {
  return {
    rncEmisor: null,
    nombreEmisor: null,
    rncReceptor: null,
    nombreReceptor: null,
    ncf: null,
    ncfModificado: null,
    fechaEmision: null,
    fechaVencimientoNcf: null,
    montoGravado: null,
    montoExento: null,
    itbis: null,
    isc: null,
    propinaLegal: null,
    otrosImpuestos: null,
    montoTotal: null,
    moneda: null,
    tasaCambio: null,
    formaPagoImpresa: null,
    condicionPago: null,
    lineas: [],
    ...overrides,
  };
}

describe('reforzarConPatrones', () => {
  it('no toca un NCF que ya es válido', () => {
    const hechos = hechosBase({ ncf: 'B0100000123' });
    const resultado = reforzarConPatrones(hechos, 'texto irrelevante sin otro NCF');
    expect(resultado.ncf).toBe('B0100000123');
  });

  it('reemplaza un NCF inválido del modelo si encuentra uno válido en el texto', () => {
    const hechos = hechosBase({ ncf: '177664' }); // el modelo confundió el # de factura con el NCF
    const texto = 'NCF 00000000B0200467854';
    const resultado = reforzarConPatrones(hechos, texto);
    expect(resultado.ncf).toBe('B0200467854');
  });

  it('deja el NCF como vino si tampoco encuentra nada mejor en el texto', () => {
    const hechos = hechosBase({ ncf: '177664' });
    const resultado = reforzarConPatrones(hechos, 'sin ningún NCF reconocible aquí');
    expect(resultado.ncf).toBe('177664');
  });

  it('completa rncEmisor/rncReceptor desde el texto cuando el modelo no los detectó', () => {
    const rnc1 = rncValido('13012345');
    const rnc2 = rncValido('10192993');
    const texto = `Empresa SRL\nRNC: ${rnc1}\n\nCliente\nRNC: ${rnc2}`;
    const resultado = reforzarConPatrones(hechosBase(), texto);
    expect(resultado.rncEmisor).toBe(rnc1);
    expect(resultado.rncReceptor).toBe(rnc2);
  });

  it('no reemplaza un rncEmisor ya válido aunque el texto tenga otro', () => {
    const rncModelo = rncValido('20000001');
    const rncTexto = rncValido('13012345');
    const hechos = hechosBase({ rncEmisor: rncModelo });
    const resultado = reforzarConPatrones(hechos, `RNC: ${rncTexto}`);
    expect(resultado.rncEmisor).toBe(rncModelo);
  });

  it('completa itbis desde el texto cuando el modelo no lo detectó (null)', () => {
    const hechos = hechosBase({ itbis: null });
    const resultado = reforzarConPatrones(hechos, 'ITBIS 18%   180.00');
    expect(resultado.itbis).toBe('180.00');
  });

  it('NO reemplaza un "0" explícito del modelo — es una respuesta válida (ítem exento), no una falta', () => {
    const hechos = hechosBase({ itbis: '0' });
    const resultado = reforzarConPatrones(hechos, 'ITBIS 18%   180.00');
    expect(resultado.itbis).toBe('0');
  });

  it('completa formaPagoImpresa buscando palabras clave en el texto', () => {
    const resultado = reforzarConPatrones(hechosBase(), 'TOTAL 25.00\nEFECTIVO 500.00');
    expect(resultado.formaPagoImpresa).toBe('efectivo');
  });
});
