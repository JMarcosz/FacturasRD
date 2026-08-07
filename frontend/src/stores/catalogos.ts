import { defineStore } from 'pinia';
import { obtenerCatalogos } from '../api/catalogos';
import type { CatalogosDgii, EntradaCatalogo } from '../types';

const VACIO: CatalogosDgii = {
  tiposIdentificacion: [],
  tiposIngreso607: [],
  tiposBienesServicios606: [],
  formasPago606: [],
  tiposNcf: [],
};

/**
 * Los catálogos de la DGII cambian con la ley, no con la sesión: se piden una
 * sola vez y se comparten. `cargar()` es idempotente — cada pantalla la llama
 * sin coordinarse con las demás y solo la primera dispara la petición.
 */
export const useCatalogosStore = defineStore('catalogos', {
  state: () => ({ catalogos: VACIO, cargado: false, cargando: null as Promise<void> | null }),
  getters: {
    /** `{ codigo, descripcion, etiqueta }` — `etiqueta` es lo que va en los selectores. */
    etiquetar: () => (entradas: EntradaCatalogo[]) =>
      entradas.map((e) => ({ ...e, etiqueta: `${e.codigo} · ${e.descripcion}` })),
  },
  actions: {
    async cargar() {
      if (this.cargado) return;
      if (this.cargando) return this.cargando;
      this.cargando = obtenerCatalogos()
        .then((c) => {
          this.catalogos = c;
          this.cargado = true;
        })
        .finally(() => {
          this.cargando = null;
        });
      return this.cargando;
    },
    descripcion(entradas: EntradaCatalogo[], codigo: string | null): string {
      if (!codigo) return '—';
      const encontrada = entradas.find((e) => e.codigo === codigo);
      return encontrada ? `${encontrada.codigo} · ${encontrada.descripcion}` : codigo;
    },
  },
});
