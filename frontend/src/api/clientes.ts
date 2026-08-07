import { http } from './client';
import type { Cliente, GrupoDuplicado, ResultadoImportacion, ResultadoReclasificacion } from '../types';

export interface CrearClienteInput {
  rnc: string;
  nombre: string;
  tipoIngresoDefault?: string;
  tasaItbis?: number;
  aplicaProporcionalidad?: boolean;
}

export function listarClientes() {
  return http.get<Cliente[]>('/clientes').then((r) => r.data);
}

export function obtenerCliente(id: string) {
  return http.get<Cliente>(`/clientes/${id}`).then((r) => r.data);
}

export function crearCliente(input: CrearClienteInput) {
  return http.post<Cliente>('/clientes', input).then((r) => r.data);
}

export function actualizarCliente(id: string, input: Partial<CrearClienteInput> & { activo?: boolean }) {
  return http.patch<Cliente>(`/clientes/${id}`, input).then((r) => r.data);
}

export function confirmarCliente(id: string, tipoIngresoDefault?: string) {
  return http.patch<Cliente>(`/clientes/${id}/confirmar`, { tipoIngresoDefault }).then((r) => r.data);
}

export function descartarCliente(id: string) {
  return http.patch<Cliente>(`/clientes/${id}/descartar`, {}).then((r) => r.data);
}

export function detectarDuplicados() {
  return http.get<GrupoDuplicado[]>('/clientes/duplicados').then((r) => r.data);
}

export function fusionarClientes(idPrincipal: string, idsSecundarios: string[]) {
  return http.post<Cliente>('/clientes/fusionar', { idPrincipal, idsSecundarios }).then((r) => r.data);
}

export function reclasificarFacturas(clienteId: string) {
  return http.post<ResultadoReclasificacion>(`/clientes/${clienteId}/reclasificar`).then((r) => r.data);
}

/**
 * El backend espera la lista bajo la clave `filas` (ImportarClientesDto) y
 * responde `{ procesados, total, fallidos }` — no `{ importados, errores }`.
 * Mandarlo con otro nombre hacía que el ValidationPipe rechazara el cuerpo
 * entero con un 400 antes de llegar al servicio.
 */
export function importarClientes(filas: CrearClienteInput[]) {
  return http.post<ResultadoImportacion>('/clientes/importar', { filas }).then((r) => r.data);
}
