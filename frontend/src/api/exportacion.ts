import { http } from './client';
import type { EstadoExportable, Exportacion, ExportacionGlobal } from '../types';

export function verificarExportable(periodoId: string) {
  return http.get<EstadoExportable>(`/periodos/${periodoId}/exportacion/estado`).then((r) => r.data);
}

export function historialExportaciones(periodoId: string) {
  return http.get<Exportacion[]>(`/periodos/${periodoId}/exportacion/historial`).then((r) => r.data);
}

/** Historial de todos los períodos y clientes, para la lista de Reportería. */
export function exportacionesRecientes(limite = 10) {
  return http
    .get<{ items: ExportacionGlobal[]; total: number }>('/exportacion/historial', { params: { limite } })
    .then((r) => r.data);
}

/** Dispara la descarga de un blob ya obtenido, respetando el filename del servidor. */
function guardarBlob(data: Blob, headers: Record<string, unknown>, filenameFallback: string) {
  const disposition = headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const blobUrl = URL.createObjectURL(data);
  const enlace = document.createElement('a');
  enlace.href = blobUrl;
  enlace.download = match?.[1] ?? filenameFallback;
  enlace.click();
  URL.revokeObjectURL(blobUrl);
}

async function descargarPost(url: string, filenameFallback: string) {
  const response = await http.post(url, null, { responseType: 'blob' });
  guardarBlob(response.data as Blob, response.headers as Record<string, unknown>, filenameFallback);
}

export function descargarTxt(periodoId: string) {
  return descargarPost(`/periodos/${periodoId}/exportacion/txt`, 'declaracion.txt');
}

export function descargarExcel(periodoId: string) {
  return descargarPost(`/periodos/${periodoId}/exportacion/excel`, 'declaracion.xlsx');
}

/**
 * Vuelve a bajar un archivo ya generado. Los botones de arriba regeneran desde
 * cero y fallan con 409 si el período adquirió errores después de exportarse;
 * este sirve el archivo tal cual quedó guardado.
 */
export async function descargarExportacionGuardada(exportacionId: string, filenameFallback = 'exportacion') {
  const response = await http.get(`/exportacion/historial/${exportacionId}/archivo`, { responseType: 'blob' });
  guardarBlob(response.data as Blob, response.headers as Record<string, unknown>, filenameFallback);
}

/**
 * Excel de consulta interna. `clienteId` vacío significa "todos los clientes":
 * se omite el parámetro (no se manda ''), porque el backend lo valida como UUID.
 */
export async function descargarExcelPorRango(
  clienteId: string | undefined,
  formato: 'F606' | 'F607',
  desde: string,
  hasta: string,
) {
  const response = await http.get('/exportacion/excel-rango', {
    params: { clienteId: clienteId || undefined, formato, desde, hasta },
    responseType: 'blob',
  });
  guardarBlob(response.data as Blob, response.headers as Record<string, unknown>, 'reporte.xlsx');
}
