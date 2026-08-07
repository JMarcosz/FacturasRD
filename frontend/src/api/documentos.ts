import { http } from './client';
import type { Diagnostico, Documento } from '../types';

export function subirDocumentosGlobal(archivos: File[]) {
  const form = new FormData();
  for (const archivo of archivos) form.append('archivos', archivo);
  return http
    .post<Array<Documento & { duplicado: boolean }>>('/documentos', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
}

export function listarDocumentosPendientesGlobales() {
  return http.get<Documento[]>('/documentos/pendientes').then((r) => r.data);
}

export function eliminarDocumento(id: string) {
  return http.delete(`/documentos/${id}`);
}

export function obtenerArchivoDocumento(id: string) {
  return http.get(`/documentos/${id}/archivo`, { responseType: 'blob' }).then((r) => r.data as Blob);
}

export function obtenerDiagnostico(id: string) {
  return http.get<Diagnostico>(`/documentos/${id}/diagnostico`).then((r) => r.data);
}
