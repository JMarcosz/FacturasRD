<script setup lang="ts">
import { computed } from 'vue';

/**
 * Avatar cuadrado con iniciales y color derivado del propio nombre — así el
 * mismo comercio conserva su color entre pantallas sin guardarlo en la base.
 */
const props = withDefaults(defineProps<{ nombre: string | null; tamano?: number; radio?: number }>(), {
  tamano: 26,
  radio: 7,
});

const PALETA = [
  { fondo: '#f0fdfa', color: '#0f766e' },
  { fondo: '#fff7ed', color: '#c2410c' },
  { fondo: '#eef2ff', color: '#4338ca' },
  { fondo: '#ecfdf3', color: '#067647' },
  { fondo: '#fdf2f8', color: '#be185d' },
  { fondo: '#fefce8', color: '#a16207' },
  { fondo: '#eff6ff', color: '#1d4ed8' },
  { fondo: '#fef3f2', color: '#b42318' },
];

const iniciales = computed(() =>
  (props.nombre ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '·',
);

const tono = computed(() => {
  const texto = props.nombre ?? '';
  let suma = 0;
  for (let i = 0; i < texto.length; i++) suma = (suma + texto.charCodeAt(i)) % 997;
  return PALETA[suma % PALETA.length];
});
</script>

<template>
  <div
    class="avatar"
    :style="{
      width: `${tamano}px`,
      height: `${tamano}px`,
      borderRadius: `${radio}px`,
      fontSize: `${Math.round(tamano * 0.38)}px`,
      background: tono.fondo,
      color: tono.color,
    }"
  >
    {{ iniciales }}
  </div>
</template>

<style scoped>
.avatar {
  display: grid;
  place-items: center;
  font-weight: 700;
  flex: none;
  line-height: 1;
}
</style>
