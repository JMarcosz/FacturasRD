<script setup lang="ts">
import { computed } from 'vue';

/**
 * Tarjeta de KPI del diseño: icono en cuadro suave, etiqueta, cifra grande y
 * una línea de variación contra el mes anterior.
 *
 * `delta` en null significa "no hay base con la que comparar" (mes anterior en
 * cero): se omite la línea en vez de inventar un +100%.
 */
const props = defineProps<{
  label: string;
  valor: string;
  icono: string;
  color: string;
  fondo: string;
  delta?: number | null;
  sub?: string;
  /** Cuando subir es malo (errores, sin clasificar) se invierte el color del delta. */
  subirEsMalo?: boolean;
}>();

const hayDelta = computed(() => props.delta !== null && props.delta !== undefined && Number.isFinite(props.delta));
const sube = computed(() => (props.delta ?? 0) >= 0);
const colorDelta = computed(() => {
  const bueno = props.subirEsMalo ? !sube.value : sube.value;
  return bueno ? 'var(--ok)' : 'var(--error)';
});
const textoDelta = computed(() => {
  const d = props.delta ?? 0;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%`;
});
</script>

<template>
  <div class="kpi">
    <div class="kpi__cabecera">
      <div class="kpi__icono" :style="{ background: fondo }">
        <i class="pi" :class="icono" :style="{ fontSize: '11.5px', color }"></i>
      </div>
      <span class="kpi__label">{{ label }}</span>
    </div>
    <div class="kpi__valor">{{ valor }}</div>
    <div v-if="hayDelta" class="kpi__delta" :style="{ color: colorDelta }">
      <i class="pi" :class="sube ? 'pi-arrow-up-right' : 'pi-arrow-down-right'" style="font-size: 9.5px"></i>
      {{ textoDelta }}
      <span v-if="sub" class="kpi__sub">{{ sub }}</span>
    </div>
    <div v-else-if="sub" class="kpi__delta kpi__delta--vacio">{{ sub }}</div>
  </div>
</template>

<style scoped>
.kpi {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  padding: 15px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.kpi__cabecera {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kpi__icono {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  flex: 0 0 24px;
}
.kpi__label {
  font-size: 12px;
  color: var(--texto-suave);
  font-weight: 600;
}
.kpi__valor {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.9px;
  line-height: 1;
}
.kpi__delta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
}
.kpi__delta--vacio {
  color: var(--texto-debil);
  font-weight: 500;
}
.kpi__sub {
  color: var(--texto-debil);
  font-weight: 500;
}

@media (max-width: 768px) {
  .kpi {
    padding: 12px 14px;
    gap: 7px;
  }
  .kpi__valor {
    font-size: 22px;
  }
  .kpi__icono {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    border-radius: 6px;
  }
  .kpi__icono :deep(i) {
    font-size: 10px;
  }
}

@media (max-width: 480px) {
  .kpi {
    padding: 10px 12px;
    gap: 6px;
    border-radius: 10px;
  }
  .kpi__valor {
    font-size: 20px;
    letter-spacing: -0.6px;
  }
  .kpi__label {
    font-size: 11px;
  }
  .kpi__delta {
    font-size: 10.5px;
  }
  .kpi__icono {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
  }
}
</style>
