import { parsearNcf, validarCedula, validarRnc } from '../../dgii';
import type { FacturaExtraida } from '../../dgii';

export interface ValidationIssue {
  field: string;
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  requiresReview: boolean;
  issues: ValidationIssue[];
}

/**
 * Valida si un string es un RNC válido de 9 dígitos o Cédula de 11 dígitos,
 * verificando longitud y algoritmo oficial de dígito verificador de la DGII.
 */
export function isValidRncOrCedula(value: string | null | undefined): boolean {
  if (!value) return false;
  const digitos = value.replace(/\D/g, '');
  if (digitos.length === 9) return validarRnc(digitos);
  if (digitos.length === 11) return validarCedula(digitos);
  return false;
}

/**
 * Valida si un string cumple el formato fiscal de NCF tradicional (B + 10 dígitos)
 * o Comprobante Fiscal Electrónico e-CF (E + 12 dígitos).
 */
export function isValidNcf(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toUpperCase();
  const res = parsearNcf(v);
  return res.formatoValido;
}

/**
 * Valida que una fecha tenga formato estricto ISO YYYY-MM-DD y sea una fecha válida de calendario.
 */
export function isValidDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  const [year, month, day] = trimmed.split('-').map((n) => parseInt(n, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Valida que un monto sea una cadena numérica válida no negativa con punto decimal opcional.
 */
export function isValidAmount(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === '') return true;
  const trimmed = value.trim().replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(trimmed);
}

/**
 * Quality Gate determinístico de TypeScript para validar la extracción de hechos.
 */
export function validateExtraction(data: FacturaExtraida): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Validación de NCF
  if (!data.ncf || !isValidNcf(data.ncf)) {
    issues.push({
      field: 'ncf',
      code: 'INVALID_NCF',
      severity: 'error',
      message: `NCF inválido o no reconocido: "${data.ncf ?? 'vacío'}".`,
    });
  }

  // 2. Validación de Identificadores (RNC / Cédula)
  if (data.rncEmisor && !isValidRncOrCedula(data.rncEmisor)) {
    issues.push({
      field: 'rncEmisor',
      code: 'INVALID_IDENTIFIER',
      severity: 'error',
      message: `RNC del emisor inválido: "${data.rncEmisor}".`,
    });
  }

  if (data.rncReceptor && !isValidRncOrCedula(data.rncReceptor)) {
    issues.push({
      field: 'rncReceptor',
      code: 'INVALID_IDENTIFIER',
      severity: 'error',
      message: `RNC del receptor inválido: "${data.rncReceptor}".`,
    });
  }

  // 3. Regla de Identidad Cruzada: Emisor y Receptor no deben ser idénticos
  if (data.rncEmisor && data.rncReceptor && data.rncEmisor.replace(/\D/g, '') === data.rncReceptor.replace(/\D/g, '')) {
    issues.push({
      field: 'rncEmisor',
      code: 'IDENTICAL_ENTITIES',
      severity: 'warning',
      message: 'El RNC del emisor y del receptor son idénticos.',
    });
  }

  // 4. Validación de Fechas
  if (data.fechaEmision && !isValidDate(data.fechaEmision)) {
    issues.push({
      field: 'fechaEmision',
      code: 'INVALID_DATE',
      severity: 'error',
      message: `Fecha de emisión con formato inválido: "${data.fechaEmision}".`,
    });
  }

  // 5. Validación de Montos
  if (!isValidAmount(data.montoTotal)) {
    issues.push({
      field: 'montoTotal',
      code: 'INVALID_AMOUNT',
      severity: 'error',
      message: `Monto total con formato inválido: "${data.montoTotal}".`,
    });
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    requiresReview: issues.length > 0,
    issues,
  };
}
