<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { useHiloConductor } from '../../composables/useHiloConductor';
import type { ResumenEstadisticas } from '../../types';

/**
 * Hilo conductor persistente: Importar → Clasificar → Confirmar → Descargar,
 * visible desde cualquier pantalla (se monta una sola vez en AppLayout). El
 * botón siempre lleva al primer paso con trabajo pendiente — nunca hay que
 * adivinar dónde seguir.
 */
const props = defineProps<{ resumen: ResumenEstadisticas | null }>();

const router = useRouter();
const resumenRef = toRef(props, 'resumen');
const { pasos, pasoActual } = useHiloConductor(resumenRef);

// Nada que mostrar sin facturas este mes — una cinta de "0 de 0" en todos los
// pasos no orienta a nadie, solo ocupa espacio.
const visible = computed(() => (props.resumen?.mes.escaneadas ?? 0) > 0);

function ir(ruta: { name: string; query?: Record<string, string> }) {
  router.push(ruta);
}
</script>

<template>
  <div v-if="visible" class="cinta">
    <div class="cinta__pasos">
      <template v-for="(paso, i) in pasos" :key="paso.id">
        <button
          type="button"
          class="paso"
          :class="{ 'paso--pendiente': paso.pendiente, 'paso--actual': pasoActual?.id === paso.id }"
          @click="ir(paso.ruta)"
        >
          <span class="paso__numero">{{ i + 1 }}</span>
          <span class="paso__texto">
            <span class="paso__label">{{ paso.label }}</span>
            <span class="paso__detalle">{{ paso.cifra }} · {{ paso.detalle }}</span>
          </span>
        </button>
        <i v-if="i < pasos.length - 1" class="pi pi-angle-right cinta__flecha"></i>
      </template>
    </div>

    <button v-if="pasoActual" type="button" class="cinta__siguiente" @click="ir(pasoActual.ruta)">
      {{ pasoActual.id === 'descargar' && !pasoActual.pendiente ? 'Descargar reportes' : 'Continuar' }}
      <i class="pi pi-arrow-right" style="font-size: 11px"></i>
    </button>
  </div>
</template>

<style scoped>
.cinta {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 22px;
  background: var(--superficie);
  border-bottom: 1px solid var(--borde);
  overflow-x: auto;
}
.cinta__pasos {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.cinta__flecha {
  font-size: 10px;
  color: var(--texto-debil);
  flex: none;
}
.paso {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  background: none;
  border-radius: 8px;
  padding: 5px 9px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.paso:hover {
  background: var(--superficie-alt);
}
.paso__numero {
  width: 18px;
  height: 18px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--borde-tenue);
  color: var(--texto-suave);
  font-size: 10px;
  font-weight: 700;
}
.paso--pendiente .paso__numero {
  background: var(--alerta-fondo);
  color: var(--alerta);
}
.paso--actual .paso__numero {
  background: var(--teal);
  color: #fff;
}
.paso__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  white-space: nowrap;
}
.paso__label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--texto);
}
.paso__detalle {
  font-size: 10.5px;
  color: var(--texto-tenue);
}
.paso--actual .paso__detalle {
  color: var(--teal);
  font-weight: 600;
}
.cinta__siguiente {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  padding: 8px 14px;
  background: var(--teal);
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.cinta__siguiente:hover {
  background: var(--teal-oscuro);
}

@media (max-width: 768px) {
  .cinta {
    padding: 8px 14px;
  }
  .paso__texto {
    display: none;
  }
}
</style>
