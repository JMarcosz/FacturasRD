import { describirTipoNcf, esNotaCredito, parsearNcf } from './ncf';

describe('parsearNcf', () => {
  it('reconoce un NCF de serie de papel válido (B + 2 dígitos tipo + 8 secuencia)', () => {
    const r = parsearNcf('B0100000001');
    expect(r.formatoValido).toBe(true);
    expect(r.esECF).toBe(false);
    expect(r.tipo).toBe('01');
    expect(r.tipoValido).toBe(true);
  });

  it('reconoce un e-CF válido (E + 2 dígitos tipo + 10 secuencia)', () => {
    const r = parsearNcf('E310000000001');
    expect(r.formatoValido).toBe(true);
    expect(r.esECF).toBe(true);
    expect(r.tipo).toBe('31');
    expect(r.tipoValido).toBe(true);
  });

  it('marca tipo no reconocido cuando el código de 2 dígitos no está en el catálogo', () => {
    const r = parsearNcf('B9900000001');
    expect(r.formatoValido).toBe(true);
    expect(r.tipoValido).toBe(false);
  });

  it('rechaza formatos que no calzan ninguna de las dos variantes', () => {
    expect(parsearNcf('12345').formatoValido).toBe(false);
    expect(parsearNcf('').formatoValido).toBe(false);
    expect(parsearNcf('BB0100000001').formatoValido).toBe(false);
  });

  it('normaliza a mayúsculas y recorta espacios', () => {
    expect(parsearNcf(' b0100000001 ').valor).toBe('B0100000001');
  });
});

describe('esNotaCredito', () => {
  it('identifica el tipo 04 como nota de crédito', () => {
    expect(esNotaCredito('B0400000001')).toBe(true);
  });
  it('no marca otros tipos como nota de crédito', () => {
    expect(esNotaCredito('B0100000001')).toBe(false);
  });
});

describe('describirTipoNcf', () => {
  it('describe el tipo 01 como Crédito Fiscal', () => {
    expect(describirTipoNcf('B0100000001')).toEqual({ codigo: '01', descripcion: 'Crédito Fiscal' });
  });

  it('describe el tipo 02 como Consumo', () => {
    expect(describirTipoNcf('B0200000001')).toEqual({ codigo: '02', descripcion: 'Consumo' });
  });

  it('funciona igual para un e-CF válido', () => {
    expect(describirTipoNcf('E020000000001')).toEqual({ codigo: '02', descripcion: 'Consumo' });
  });

  it('devuelve "Tipo no reconocido" para un código de 2 dígitos que no está en el catálogo, sin reventar', () => {
    expect(describirTipoNcf('B9900000001')).toEqual({ codigo: '99', descripcion: 'Tipo no reconocido' });
  });

  it('devuelve null cuando el NCF no tiene un formato válido', () => {
    expect(describirTipoNcf('177664')).toBeNull();
    expect(describirTipoNcf('')).toBeNull();
  });
});
