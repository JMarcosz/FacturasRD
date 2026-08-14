import { http } from './client';
import type { SugerenciaCliente } from '../types';

export async function listarSugerencias(incluirDescartados = false): Promise<SugerenciaCliente[]> {
  const { data } = await http.get<SugerenciaCliente[]>('/sugerencias', {
    params: { incluirDescartados: incluirDescartados ? 'true' : 'false' },
  });
  return data;
}

export async function descartarSugerencia(id: string): Promise<SugerenciaCliente> {
  const { data } = await http.patch<SugerenciaCliente>(`/sugerencias/${id}/descartar`);
  return data;
}
