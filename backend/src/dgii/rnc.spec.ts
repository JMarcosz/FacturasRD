import {
  calcularDigitoVerificadorCedula,
  calcularDigitoVerificadorRnc,
  limpiarIdentificacion,
  detectarTipoIdentificacion,
  normalizarIdentificacion,
  validarCedula,
  validarRnc,
} from './rnc';

function rncValidoDePrueba(base8: string): string {
  return base8 + String(calcularDigitoVerificadorRnc(base8));
}

function cedulaValidaDePrueba(base10: string): string {
  return base10 + String(calcularDigitoVerificadorCedula(base10));
}

describe('validarRnc', () => {
  it('acepta un RNC cuyo dígito verificador se calculó con el mismo algoritmo', () => {
    const rnc = rncValidoDePrueba('13012345');
    expect(validarRnc(rnc)).toBe(true);
  });

  it('rechaza un RNC con el dígito verificador alterado', () => {
    const rnc = rncValidoDePrueba('13012345');
    const digitoMalo = String((parseInt(rnc[8], 10) + 1) % 10);
    expect(validarRnc(rnc.slice(0, 8) + digitoMalo)).toBe(false);
  });

  it('rechaza longitudes distintas de 9', () => {
    expect(validarRnc('12345678')).toBe(false);
    expect(validarRnc('1234567890')).toBe(false);
  });

  it('ignora guiones al validar', () => {
    const rnc = rncValidoDePrueba('13012345');
    const conGuiones = `${rnc.slice(0, 1)}-${rnc.slice(1, 3)}-${rnc.slice(3, 8)}-${rnc.slice(8)}`;
    expect(validarRnc(conGuiones)).toBe(true);
  });
});

describe('validarCedula', () => {
  it('acepta una cédula cuyo dígito verificador se calculó con el mismo algoritmo', () => {
    const cedula = cedulaValidaDePrueba('0010192993');
    expect(validarCedula(cedula)).toBe(true);
  });

  it('rechaza una cédula con el dígito verificador alterado', () => {
    const cedula = cedulaValidaDePrueba('0010192993');
    const digitoMalo = String((parseInt(cedula[10], 10) + 1) % 10);
    expect(validarCedula(cedula.slice(0, 10) + digitoMalo)).toBe(false);
  });

  it('rechaza longitudes distintas de 11', () => {
    expect(validarCedula('1234567890')).toBe(false);
  });
});

describe('detectarTipoIdentificacion', () => {
  it('detecta RNC por longitud de 9 dígitos', () => {
    expect(detectarTipoIdentificacion('130123454')).toBe('1');
  });
  it('detecta Cédula por longitud de 11 dígitos', () => {
    expect(detectarTipoIdentificacion('00101929933')).toBe('2');
  });
  it('cae en Pasaporte para cualquier otra longitud', () => {
    expect(detectarTipoIdentificacion('AB1234567')).toBe('3');
  });
});

describe('normalizarIdentificacion', () => {
  it('elimina todo lo que no sea dígito', () => {
    expect(normalizarIdentificacion('1-30-12345-4')).toBe('130123454');
  });
});

describe('limpiarIdentificacion', () => {
  it('quita guiones, puntos y espacios de un RNC', () => {
    expect(limpiarIdentificacion('1-30-12345-4')).toBe('130123454');
    expect(limpiarIdentificacion(' 130.123.454 ')).toBe('130123454');
  });

  it('quita los separadores de una cédula', () => {
    expect(limpiarIdentificacion('001-0192993-3')).toBe('00101929933');
  });

  // La diferencia con `normalizarIdentificacion`: un pasaporte es una
  // identificación válida ante la DGII y quedaría destrozado si se le quitan
  // las letras.
  it('conserva las letras de un pasaporte', () => {
    expect(limpiarIdentificacion('AB-123456')).toBe('AB123456');
    expect(limpiarIdentificacion('ab123456')).toBe('AB123456');
  });

  it('devuelve cadena vacía para null, undefined o basura sin alfanuméricos', () => {
    expect(limpiarIdentificacion(null)).toBe('');
    expect(limpiarIdentificacion(undefined)).toBe('');
    expect(limpiarIdentificacion('---')).toBe('');
  });

  it('deja igual lo que ya viene limpio, para que guardar sea idempotente', () => {
    expect(limpiarIdentificacion('130123454')).toBe('130123454');
    expect(limpiarIdentificacion(limpiarIdentificacion('1-30-12345-4'))).toBe('130123454');
  });
});
