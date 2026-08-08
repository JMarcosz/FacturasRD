import { computed, type Ref } from 'vue';
import type { ResumenEstadisticas } from '../types';

export interface PasoHilo {
  id: 'importar' | 'clasificar' | 'confirmar' | 'descargar';
  label: string;
  cifra: number;
  detalle: string;
  /** Necesita atención — es lo que decide qué paso resalta y a dónde lleva el botón de "siguiente". */
  pendiente: boolean;
  ruta: { name: string; query?: Record<string, string> };
}

/**
 * Deriva los 4 pasos del flujo (Importar → Clasificar → Confirmar →
 * Descargar) del MISMO resumen que ya carga `AppLayout` — sin pedirle nada
 * nuevo al backend. Lo usan la cinta persistente (`CintaProgreso.vue`, en
 * todas las pantallas) y el Dashboard (con más detalle visual), para que las
 * tres piezas del hilo conductor cuenten siempre la misma historia.
 */
export function useHiloConductor(resumen: Ref<ResumenEstadisticas | null>) {
  const pasos = computed<PasoHilo[]>(() => {
    const r = resumen.value;
    if (!r) return [];

    const cola = r.colaDocumentos.pendientes + r.colaDocumentos.procesando;
    const porConfirmar = Math.max(0, r.mes.clasificadas - r.mes.confirmadas);

    return [
      {
        id: 'importar',
        label: 'Importar',
        cifra: r.mes.escaneadas,
        detalle:
          cola > 0
            ? `${cola} ${cola === 1 ? 'documento' : 'documentos'} en proceso`
            : r.colaDocumentos.error > 0
              ? `${r.colaDocumentos.error} con error de extracción`
              : 'al día',
        pendiente: cola > 0 || r.colaDocumentos.error > 0,
        ruta: { name: 'facturas' },
      },
      {
        id: 'clasificar',
        label: 'Clasificar',
        cifra: r.mes.clasificadas,
        detalle: r.mes.sinClasificar > 0 ? `${r.mes.sinClasificar} sin clasificar` : 'todo clasificado',
        pendiente: r.mes.sinClasificar > 0,
        ruta: { name: 'facturas', query: { vista: 'sin_clasificar' } },
      },
      {
        id: 'confirmar',
        label: 'Confirmar',
        cifra: r.mes.confirmadas,
        detalle: porConfirmar > 0 ? `${porConfirmar} por confirmar` : 'todo confirmado',
        pendiente: porConfirmar > 0,
        ruta: { name: 'facturas', query: { vista: 'por_confirmar' } },
      },
      {
        id: 'descargar',
        label: 'Descargar',
        cifra: r.mes.exportadas,
        detalle:
          r.mes.conErrorValidacion > 0
            ? `${r.mes.conErrorValidacion} errores bloquean el TXT`
            : 'listo para exportar',
        pendiente: r.mes.conErrorValidacion > 0,
        ruta: { name: 'reporteria' },
      },
    ];
  });

  /**
   * El primer paso con trabajo pendiente, en orden. Si ninguno lo tiene pero
   * ya hay facturas este mes, el "siguiente paso" es simplemente descargar —
   * por eso el fallback, en vez de `null`, es el propio paso de descarga.
   */
  const pasoActual = computed<PasoHilo | null>(() => {
    const r = resumen.value;
    if (!r || r.mes.escaneadas === 0) return null;
    return pasos.value.find((p) => p.pendiente) ?? pasos.value[3];
  });

  return { pasos, pasoActual };
}
