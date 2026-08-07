import { http } from './client';
import type { ReglaComercio } from '../types';

export const apiReglas = {
  listar: async () => {
    const res = await http.get<ReglaComercio[]>('/reglas');
    return res.data;
  },
  obtener: async (id: string) => {
    const res = await http.get<ReglaComercio>(`/reglas/${id}`);
    return res.data;
  },
  crear: async (datos: Partial<ReglaComercio>) => {
    const res = await http.post<ReglaComercio>('/reglas', datos);
    return res.data;
  },
  actualizar: async (id: string, datos: Partial<ReglaComercio>) => {
    // El controller expone @Patch(':id') — con PUT esto era un 404.
    const res = await http.patch<ReglaComercio>(`/reglas/${id}`, datos);
    return res.data;
  },
  eliminar: async (id: string) => {
    await http.delete(`/reglas/${id}`);
  },
};
