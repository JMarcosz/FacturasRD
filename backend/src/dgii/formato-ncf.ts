import { parsearNcf } from './ncf';
import type { Formato } from './types';

/** Tipos de NCF que determinan el formato sin ambigüedad. */
const TIPOS_SOLO_606: ReadonlySet<string> = new Set(['11', '13', '17']);
const TIPOS_SOLO_607: ReadonlySet<string> = new Set(['12', '15', '16']);

/**
 * Intenta determinar el formato DGII (606/607) a partir del tipo de NCF.
 * - 11 Compras, 13 Gastos Menores, 17 Pagos al Exterior → 606
 * - 12 Registro Único de Ingresos, 15 Gubernamental, 16 Exportaciones → 607
 * - 03 Nota de Débito y 04 Nota de Crédito → heredan del NCF modificado
 * - 01, 02, 14 → null (dependen del lado)
 */
export function formatoPorTipoNcf(
  ncf: string,
  ncfModificado?: string | null,
): Formato | null {
  const info = parsearNcf(ncf);
  if (!info.formatoValido || !info.tipoValido) return null;

  if (TIPOS_SOLO_606.has(info.tipo)) return 'F606';
  if (TIPOS_SOLO_607.has(info.tipo)) return 'F607';

  // Notas de débito (03) y crédito (04) heredan del comprobante afectado
  if ((info.tipo === '03' || info.tipo === '04') && ncfModificado) {
    const infoMod = parsearNcf(ncfModificado);
    if (infoMod.formatoValido && infoMod.tipoValido) {
      if (TIPOS_SOLO_606.has(infoMod.tipo)) return 'F606';
      if (TIPOS_SOLO_607.has(infoMod.tipo)) return 'F607';
    }
  }

  return null;
}
