import { http } from './client';
import type { ErrorPorCodigo, EstadisticasFacturas, ResumenEstadisticas } from '../types';
import type { FiltrosFacturas } from './facturas';

/**
 * Resumen mensual: alimenta el Dashboard, la tarjeta "Período abierto" del
 * sidebar y las métricas de las tarjetas de Clientes. Trae también el mes
 * anterior para poder calcular los deltas aquí.
 */
export function obtenerResumen(yyyymm?: string, clienteId?: string) {
  const params: Record<string, string> = {};
  if (yyyymm) params.yyyymm = yyyymm;
  if (clienteId) params.clienteId = clienteId;
  return http.get<ResumenEstadisticas>('/estadisticas/resumen', { params }).then((r) => r.data);
}

/**
 * Totales del conjunto filtrado — recibe los MISMOS filtros que
 * `listarFacturas` para que los KPIs no contradigan las filas visibles.
 */
export function obtenerEstadisticasFacturas(filtros: FiltrosFacturas = {}): Promise<EstadisticasFacturas> {
  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== undefined && v !== ''));
  return http
    .get<{ totales: Omit<EstadisticasFacturas, 'erroresBloqueantes'>; erroresBloqueantes: ErrorPorCodigo[] }>(
      '/estadisticas/facturas',
      { params },
    )
    .then((r) => ({ ...r.data.totales, erroresBloqueantes: r.data.erroresBloqueantes }));
}

/** "202607" para el mes de una fecha dada (UTC, igual que el backend). */
export function aYyyymm(fecha: Date): string {
  return `${fecha.getUTCFullYear()}${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Variación porcentual entre dos meses. Devuelve null cuando la base es 0 —
 * ahí no hay porcentaje que mostrar, y "+∞%" no le sirve a nadie.
 */
export function delta(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}
