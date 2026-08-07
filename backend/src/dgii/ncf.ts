import { esTipoNcfValido, TIPOS_NCF, TIPOS_NCF_NOTA_CREDITO } from './catalogos';

/** NCF "de papel" (Norma 06-2018): 1 letra de serie + 2 dígitos de tipo + 8 de secuencia = 11. */
const REGEX_NCF_SERIE = /^[A-Z]\d{10}$/;

/** e-CF (Ley 32-23): "E" + 2 dígitos de tipo + 10 de secuencia = 13. */
const REGEX_NCF_ECF = /^E\d{12}$/;

export interface NcfParseado {
  valor: string;
  esECF: boolean;
  tipo: string; // 2 dígitos
  formatoValido: boolean;
  tipoValido: boolean;
}

export function parsearNcf(valor: string): NcfParseado {
  const v = valor.trim().toUpperCase();
  const esECF = REGEX_NCF_ECF.test(v);
  const esSerie = REGEX_NCF_SERIE.test(v);
  const formatoValido = esECF || esSerie;

  let tipo = '';
  if (esECF) tipo = v.slice(1, 3);
  else if (esSerie) tipo = v.slice(1, 3);

  return {
    valor: v,
    esECF,
    tipo,
    formatoValido,
    tipoValido: formatoValido && esTipoNcfValido(tipo),
  };
}

export function esNotaCredito(valor: string): boolean {
  const { tipo, formatoValido } = parsearNcf(valor);
  return formatoValido && TIPOS_NCF_NOTA_CREDITO.has(tipo);
}

export interface TipoNcfDescrito {
  codigo: string;
  descripcion: string;
}

/**
 * Descripción oficial DGII del tipo de comprobante (los 2 dígitos que siguen
 * a la letra del NCF — no la letra en sí, que solo distingue papel de
 * electrónico). `null` cuando el NCF no tiene un formato válido.
 */
export function describirTipoNcf(ncf: string): TipoNcfDescrito | null {
  const { formatoValido, tipo } = parsearNcf(ncf);
  if (!formatoValido) return null;
  const entrada = TIPOS_NCF.find((t) => t.codigo === tipo);
  return { codigo: tipo, descripcion: entrada?.descripcion ?? 'Tipo no reconocido' };
}
