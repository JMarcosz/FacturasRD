import { formatoPorTipoNcf } from './formato-ncf';

describe('formatoPorTipoNcf', () => {
  // 606 deterministas
  it('11 Compras → F606', () => expect(formatoPorTipoNcf('B1100000001')).toBe('F606'));
  it('13 Gastos Menores → F606', () => expect(formatoPorTipoNcf('B1300000001')).toBe('F606'));
  it('17 Pagos al Exterior → F606', () => expect(formatoPorTipoNcf('B1700000001')).toBe('F606'));

  // 607 deterministas
  it('12 Registro Único de Ingresos → F607', () => expect(formatoPorTipoNcf('B1200000001')).toBe('F607'));
  it('15 Gubernamental → F607', () => expect(formatoPorTipoNcf('B1500000001')).toBe('F607'));
  it('16 Exportaciones → F607', () => expect(formatoPorTipoNcf('B1600000001')).toBe('F607'));

  // Ambiguos → null
  it('01 Crédito Fiscal → null', () => expect(formatoPorTipoNcf('B0100000001')).toBeNull());
  it('02 Consumo → null', () => expect(formatoPorTipoNcf('B0200000001')).toBeNull());
  it('14 Regímenes Especiales → null', () => expect(formatoPorTipoNcf('B1400000001')).toBeNull());

  // Notas heredan
  it('03 Nota de Débito hereda de 11 Compras → F606', () => {
    expect(formatoPorTipoNcf('B0300000001', 'B1100000001')).toBe('F606');
  });
  it('04 Nota de Crédito hereda de 15 Gubernamental → F607', () => {
    expect(formatoPorTipoNcf('B0400000001', 'B1500000001')).toBe('F607');
  });
  it('03 Nota de Débito sin modificado → null', () => {
    expect(formatoPorTipoNcf('B0300000001')).toBeNull();
  });
  it('04 Nota de Crédito con modificado ambiguo (02) → null', () => {
    expect(formatoPorTipoNcf('B0400000001', 'B0200000001')).toBeNull();
  });

  // e-CF
  it('e-CF E110000000001 → F606', () => expect(formatoPorTipoNcf('E110000000001')).toBe('F606'));
  it('e-CF E120000000001 → F607', () => expect(formatoPorTipoNcf('E120000000001')).toBe('F607'));

  // Inválido
  it('NCF inválido → null', () => expect(formatoPorTipoNcf('INVALIDO')).toBeNull());
});
