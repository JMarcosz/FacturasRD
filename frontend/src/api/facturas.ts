import { http } from './client';
import type { Factura, ResultadoLote } from '../types';

export interface FiltrosFacturas {
  clienteId?: string;
  formato?: 'F606' | 'F607';
  estado?: 'sin_clasificar' | 'clasificada';
  desde?: string;
  hasta?: string;
}

export function listarFacturas(filtros: FiltrosFacturas = {}) {
  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== undefined && v !== ''));
  return http.get<Factura[]>('/facturas', { params }).then((r) => r.data);
}

export function listarFacturasPorPeriodo(periodoId: string) {
  return http.get<Factura[]>(`/periodos/${periodoId}/facturas`).then((r) => r.data);
}

export function obtenerFactura(id: string) {
  return http.get<Factura>(`/facturas/${id}`).then((r) => r.data);
}

export function actualizarFactura(id: string, cambios: Record<string, unknown>) {
  return http.patch<Factura>(`/facturas/${id}`, cambios).then((r) => r.data);
}

export function clasificarFactura(id: string, clienteId: string, formato: 'F606' | 'F607') {
  return http.patch<Factura>(`/facturas/${id}/clasificar`, { clienteId, formato }).then((r) => r.data);
}

/**
 * Borrado definitivo. Si la factura era la única de su documento, el backend
 * borra también el documento y su archivo — si no, ese documento quedaría
 * bloqueado por el sha256 único y volver a subir el PDF no crearía nada.
 */
export function eliminarFactura(id: string) {
  return http.delete<{ id: string; documentoEliminado: boolean }>(`/facturas/${id}`).then((r) => r.data);
}

/** Las 7 columnas de forma de venta del 607. */
export type FormaVenta607 =
  | 'EFECTIVO'
  | 'CHEQUE_TRANSFERENCIA'
  | 'TARJETA'
  | 'VENTA_CREDITO'
  | 'BONOS'
  | 'PERMUTA'
  | 'OTRAS_FORMAS';

/** Campos que se pueden aplicar a varias facturas a la vez (solo clasificación). */
export interface CamposLote {
  tipoBienesServicios?: string | null;
  formaPago?: string | null;
  tipoIngreso?: string | null;
  tipoRetencionISR?: string | null;
  /**
   * 607: no es una columna, el backend la traduce a la distribución de los 7
   * montos usando el total de cada factura. Sin esto las ventas quedan con
   * FORMA_VENTA_INDEFINIDA y el TXT no sale.
   */
  formaVenta?: FormaVenta607;
}

export function editarLote(
  ids: string[],
  opciones: { cambios?: CamposLote; clienteId?: string; formato?: 'F606' | 'F607' },
) {
  return http.patch<ResultadoLote>('/facturas/lote/campos', { ids, ...opciones }).then((r) => r.data);
}

export function eliminarLote(ids: string[]) {
  return http
    .post<ResultadoLote & { documentosEliminados: number }>('/facturas/lote/eliminar', { ids })
    .then((r) => r.data);
}

export function confirmarClasificacionLote(ids: string[]) {
  return http.patch<ResultadoLote>('/facturas/lote/confirmar', { ids }).then((r) => r.data);
}
