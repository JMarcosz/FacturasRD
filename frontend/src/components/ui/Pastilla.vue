<script setup lang="ts">
import { computed } from 'vue';

/**
 * Pastilla de estado del diseño. `tono` elige la pareja fondo/texto; `punto`
 * añade el circulito que llevan los badges de clasificación en la tabla.
 */
const props = withDefaults(
  defineProps<{
    texto: string;
    tono?: 'ok' | 'alerta' | 'error' | 'info' | 'indigo' | 'neutro' | 'teal';
    punto?: boolean;
    icono?: string;
    /** 'sm' = la pastilla de confianza del Detalle (10px/1-7px, más discreta). */
    tamano?: 'md' | 'sm';
  }>(),
  { tono: 'neutro', punto: false, tamano: 'md' },
);

const TONOS = {
  ok: { fondo: 'var(--ok-fondo)', color: 'var(--ok)' },
  alerta: { fondo: 'var(--alerta-fondo)', color: 'var(--alerta)' },
  error: { fondo: 'var(--error-fondo)', color: 'var(--error)' },
  info: { fondo: 'var(--info-fondo)', color: 'var(--info)' },
  indigo: { fondo: 'var(--indigo-fondo)', color: 'var(--indigo)' },
  teal: { fondo: 'var(--teal-suave)', color: 'var(--teal)' },
  neutro: { fondo: '#f1f5f9', color: '#475569' },
} as const;

const estilo = computed(() => TONOS[props.tono]);
</script>

<template>
  <span class="pastilla" :class="`pastilla--${tamano}`" :style="{ background: estilo.fondo, color: estilo.color }">
    <span v-if="punto" class="pastilla__punto" :style="{ background: estilo.color }"></span>
    <i v-if="icono" class="pi" :class="icono" style="font-size: 9px"></i>
    {{ texto }}
  </span>
</template>

<style scoped>
.pastilla {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--radio-chip);
  font-weight: 700;
  white-space: nowrap;
}
.pastilla--md {
  padding: 3px 9px;
  font-size: 11px;
}
.pastilla--sm {
  padding: 1px 7px;
  font-size: 10px;
}
.pastilla__punto {
  width: 5px;
  height: 5px;
  border-radius: var(--radio-chip);
  flex: none;
}
</style>
