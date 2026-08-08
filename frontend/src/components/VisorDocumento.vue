<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { obtenerArchivoDocumento } from '../api/documentos';

/**
 * `proporcion` fija el tamaño del lienzo (no la imagen): así una foto de
 * 4000x3000 o de 300x200 dan exactamente el mismo panel — nunca es la imagen
 * la que decide el tamaño del layout. El "papel" se ajusta dentro por
 * `object-fit: contain`, igual que la bandeja gris del diseño.
 */
const props = withDefaults(
  defineProps<{
    documentoId: string;
    mimeType: string;
    proporcion?: string;
    altoMaximo?: string;
    /** En vez de un tamaño fijo por aspect-ratio, ocupa todo el alto del panel contenedor (requiere que ese panel tenga una altura definida — ver FacturaDetalleView). */
    llenar?: boolean;
  }>(),
  { proporcion: '3 / 4', altoMaximo: 'min(70vh, 640px)', llenar: false },
);

const objectUrl = ref<string | null>(null);
const zoom = ref(1);
const rotacion = ref(0);
const cargando = ref(false);

function limpiar() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
}

async function cargar() {
  limpiar();
  cargando.value = true;
  try {
    const blob = await obtenerArchivoDocumento(props.documentoId);
    objectUrl.value = URL.createObjectURL(blob);
    zoom.value = 1;
    rotacion.value = 0;
  } finally {
    cargando.value = false;
  }
}

function abrirAparte() {
  if (objectUrl.value) window.open(objectUrl.value, '_blank', 'noopener');
}

function acercar() {
  zoom.value = Math.min(3, zoom.value + 0.2);
}
function alejar() {
  zoom.value = Math.max(1, zoom.value - 0.2);
}
function rotar() {
  rotacion.value = (rotacion.value + 90) % 360;
}

watch(() => props.documentoId, cargar, { immediate: true });
onBeforeUnmount(limpiar);

// Las 4 herramientas del diseño viven en la cabecera del panel contenedor
// (junto al título "Documento original"), no dentro de este componente — se
// exponen para que la vista las dibuje donde corresponda.
defineExpose({ recargar: cargar, acercar, alejar, rotar, abrirAparte, zoom });
</script>

<template>
  <div
    class="visor__lienzo"
    :style="llenar ? { flex: '1', width: '100%', height: '100%', minHeight: '0' } : { aspectRatio: proporcion, maxHeight: altoMaximo }"
  >
    <p v-if="cargando" class="visor__estado">Cargando documento…</p>
    <template v-else-if="objectUrl">
      <embed v-if="mimeType === 'application/pdf'" :src="objectUrl" type="application/pdf" class="visor__pdf" />
      <!--
        El zoom dimensiona el MARCO (width/height en % reales, no transform),
        así que al 100% el marco mide justo el lienzo y `object-fit: contain`
        encaja la imagen sin recortarla; al ampliar, el marco ocupa más
        espacio de verdad y el `overflow: auto` del lienzo genera scroll
        real — con `transform: scale()` el área de scroll no se recalculaba
        y la parte ampliada quedaba inalcanzable.
      -->
      <div v-else class="visor__marco" :style="{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }">
        <img
          :src="objectUrl"
          class="visor__img"
          :style="{ transform: `rotate(${rotacion}deg)` }"
          alt="Documento original"
        />
      </div>
    </template>
    <p v-else class="visor__estado">No se pudo cargar el documento.</p>
  </div>
</template>

<style scoped>
.visor__lienzo {
  background: #f7f8fa;
  border: 1px solid var(--borde-tenue);
  border-radius: 11px;
  padding: 14px;
  overflow: auto;
  display: flex;
  /* Sin justify-content/align-items: center — con overflow:auto recorta el
     contenido que se sale por el lado opuesto al scroll. margin:auto en el
     marco centra sin ese efecto. */
}
.visor__marco {
  margin: auto;
  min-width: 100%;
  min-height: 100%;
  /* flex-shrink:0 es obligatorio: por defecto un hijo flex se encoge para
     caber en el padre, así que el width/height en % del zoom (160%, 200%...)
     quedaba anulado de vuelta al 100% y no había overflow que scrollear. */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.visor__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  box-shadow: 0 2px 14px rgba(16, 20, 26, 0.09);
  border-radius: 6px;
}
.visor__pdf {
  width: 100%;
  height: 100%;
  border: none;
}
.visor__estado {
  margin: auto;
  font-size: 12.5px;
  color: var(--texto-tenue);
}
</style>
