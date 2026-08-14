import { calcularDigitoVerificadorCedula, calcularDigitoVerificadorRnc } from '../../dgii/rnc';
import {
  isValidAmount,
  isValidDate,
  isValidNcf,
  isValidRncOrCedula,
  validateExtraction,
} from './extraction.validator';
import type { FacturaExtraida } from '../../dgii';

function rncValido(base8: string): string {
  return base8 + String(calcularDigitoVerificadorRnc(base8));
}

function cedulaValida(base10: string): string {
  return base10 + String(calcularDigitoVerificadorCedula(base10));
}

function hechosBase(overrides: Partial<FacturaExtraida> = {}): FacturaExtraida {
  return {
    rncEmisor: rncValido('13104484'),
    nombreEmisor: 'EMPRESA EMISORA SRL',
    rncReceptor: rncValido('10192993'),
    nombreReceptor: 'CLIENTE COMPRADOR',
    ncf: 'B0100000123',
    ncfModificado: null,
    fechaEmision: '2026-08-14',
    fechaVencimientoNcf: null,
    montoGravado: '1000.00',
    montoExento: '0',
    itbis: '180.00',
    isc: null,
    propinaLegal: null,
    otrosImpuestos: null,
    montoTotal: '1180.00',
    moneda: null,
    tasaCambio: null,
    formaPagoImpresa: 'efectivo',
    condicionPago: null,
    lineas: [],
    ...overrides,
  };
}

describe('Extraction Validators (Plan Maestro Quality Gate)', () => {
  describe('isValidRncOrCedula', () => {
    it('valida RNC correcto de 9 dígitos con checksum oficial', () => {
      expect(isValidRncOrCedula('131044842')).toBe(true);
      expect(isValidRncOrCedula('1-31-04484-2')).toBe(true);
    });

    it('rechaza RNC con longitud o checksum inválido', () => {
      expect(isValidRncOrCedula('131044849')).toBe(false);
      expect(isValidRncOrCedula('12345')).toBe(false);
      expect(isValidRncOrCedula(null)).toBe(false);
    });

    it('valida Cédula de 11 dígitos con checksum Luhn oficial', () => {
      expect(isValidRncOrCedula('00101929933')).toBe(true);
      expect(isValidRncOrCedula('001-0192993-3')).toBe(true);
    });
  });

  describe('isValidNcf', () => {
    it('valida NCF tradicional B01', () => {
      expect(isValidNcf('B0100000123')).toBe(true);
    });

    it('valida e-CF electrónico E31', () => {
      expect(isValidNcf('E310000604671')).toBe(true);
    });

    it('rechaza NCFs inválidos o truncados', () => {
      expect(isValidNcf('177664')).toBe(false);
      expect(isValidNcf('B01')).toBe(false);
      expect(isValidNcf(null)).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('valida fecha ISO estricta YYYY-MM-DD', () => {
      expect(isValidDate('2026-08-14')).toBe(true);
      expect(isValidDate('2026-02-28')).toBe(true);
    });

    it('rechaza formatos incorrectos o fechas inexistentes', () => {
      expect(isValidDate('14/08/2026')).toBe(false);
      expect(isValidDate('2026-02-31')).toBe(false);
      expect(isValidDate(null)).toBe(false);
    });
  });

  describe('isValidAmount', () => {
    it('valida montos decimales válidos', () => {
      expect(isValidAmount('1500.50')).toBe(true);
      expect(isValidAmount('0')).toBe(true);
      expect(isValidAmount(null)).toBe(true);
    });

    it('rechaza letras o montos negativos', () => {
      expect(isValidAmount('abc')).toBe(false);
      expect(isValidAmount('-100')).toBe(false);
    });
  });

  describe('validateExtraction (Quality Gate)', () => {
    it('aprueba una extracción 100% válida', () => {
      const result = validateExtraction(hechosBase());
      expect(result.valid).toBe(true);
      expect(result.requiresReview).toBe(false);
      expect(result.issues).toHaveLength(0);
    });

    it('detecta NCF inválido y genera issue crítico', () => {
      const result = validateExtraction(hechosBase({ ncf: '177664' }));
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_NCF')).toBe(true);
    });

    it('detecta fecha inválida y genera issue de fecha', () => {
      const result = validateExtraction(hechosBase({ fechaEmision: '32/13/2026' }));
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_DATE')).toBe(true);
    });

    it('advierte cuando emisor y receptor tienen el mismo RNC', () => {
      const result = validateExtraction(hechosBase({ rncEmisor: '131044842', rncReceptor: '131044842' }));
      expect(result.requiresReview).toBe(true);
      expect(result.issues.some((i) => i.code === 'IDENTICAL_ENTITIES')).toBe(true);
    });
  });
});
