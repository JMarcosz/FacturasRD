<script setup lang="ts">
/** Título + subtítulo a la izquierda, acciones a la derecha. Lo usan las 6 pantallas. */
defineProps<{ titulo: string; subtitulo?: string }>();
</script>

<template>
  <div class="encabezado">
    <div class="encabezado__texto">
      <h1>{{ titulo }}</h1>
      <p v-if="subtitulo">{{ subtitulo }}</p>
    </div>
    <div v-if="$slots.acciones" class="encabezado__acciones">
      <slot name="acciones" />
    </div>
  </div>
</template>

<style scoped>
.encabezado {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.encabezado__texto {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.encabezado__texto h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.4px;
}
.encabezado__texto p {
  margin: 0;
  font-size: 13px;
  color: var(--texto-suave);
}
.encabezado__acciones {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .encabezado {
    gap: 10px;
  }
  .encabezado__texto h1 {
    font-size: 20px;
  }
  .encabezado__acciones {
    gap: 6px;
  }
}

@media (max-width: 480px) {
  .encabezado {
    gap: 8px;
  }
  .encabezado__texto h1 {
    font-size: 18px;
  }
  .encabezado__texto p {
    font-size: 12px;
  }
  .encabezado__acciones :deep(.p-button) {
    font-size: 12px;
    padding: 6px 10px;
  }
  .encabezado__acciones :deep(.p-button .p-button-icon) {
    font-size: 11px;
  }
}
</style>
