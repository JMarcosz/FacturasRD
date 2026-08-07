import { http } from './client';
import type { Formato, Periodo } from '../types';

export function buscarPeriodo(clienteId: string, formato: Formato, yyyymm: string) {
  return http.get<Periodo[]>('/periodos', { params: { clienteId, formato, yyyymm } }).then((r) => r.data[0] ?? null);
}

export function obtenerPeriodo(id: string) {
  return http.get<Periodo>(`/periodos/${id}`).then((r) => r.data);
}
