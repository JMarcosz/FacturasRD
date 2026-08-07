import { http } from './client';
import type { CatalogosDgii } from '../types';

/**
 * Catálogos oficiales de la DGII. Vienen del backend (`src/dgii/catalogos.ts`),
 * que es contra lo que validan `esTipoIngresoValido` y compañía — antes había
 * un espejo manual en el frontend que se desincronizaba y al que además le
 * faltaba `tiposNcf`.
 */
export function obtenerCatalogos() {
  return http.get<CatalogosDgii>('/catalogos').then((r) => r.data);
}
