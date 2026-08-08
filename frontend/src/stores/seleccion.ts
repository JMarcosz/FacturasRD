import { defineStore } from 'pinia';

/**
 * IDs de las facturas seleccionadas en la tabla de FacturasView, no los
 * objetos completos. Vive en un store (no en un `ref` del componente) para
 * sobrevivir a navegar al detalle de una factura y volver — antes, ese viaje
 * desmontaba la vista y la selección se perdía en silencio.
 *
 * Guardar solo IDs (no las filas de `Factura`) evita arrastrar datos que
 * pudieron quedar viejos si la lista se recargó mientras tanto; el componente
 * recalcula las filas seleccionadas cruzando estos IDs contra la lista actual.
 */
export const useSeleccionStore = defineStore('seleccionFacturas', {
  state: () => ({ ids: new Set<string>() }),
  actions: {
    set(ids: string[]) {
      this.ids = new Set(ids);
    },
    limpiar() {
      this.ids = new Set();
    },
  },
});
