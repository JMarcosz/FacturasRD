<script setup lang="ts">
/**
 * La tarjeta blanca del diseño (borde #e6e8ec, radio 13px). Se usa en lugar
 * del `Card` de PrimeVue, que trae sombra y paddings propios que hay que
 * anular en cada sitio.
 */
withDefaults(defineProps<{ titulo?: string; subtitulo?: string; sinPadding?: boolean }>(), {
  sinPadding: false,
});
</script>

<template>
  <section class="panel">
    <header v-if="titulo || $slots.cabecera" class="panel__cabecera" :class="{ 'panel__cabecera--borde': sinPadding }">
      <div class="panel__titulos">
        <span v-if="titulo" class="panel__titulo">{{ titulo }}</span>
        <span v-if="subtitulo" class="panel__subtitulo">{{ subtitulo }}</span>
      </div>
      <slot name="cabecera" />
    </header>
    <div :class="sinPadding ? '' : 'panel__cuerpo'">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  overflow: hidden;
}
.panel__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 16px 0;
}
.panel__cabecera--borde {
  padding: 15px 16px;
  border-bottom: 1px solid var(--borde-tenue);
}
.panel__titulos {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.panel__titulo {
  font-size: 14px;
  font-weight: 600;
}
.panel__subtitulo {
  font-size: 12px;
  color: var(--texto-tenue);
}
.panel__cuerpo {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 768px) {
  .panel__cabecera {
    padding: 13px 14px 0;
  }
  .panel__cabecera--borde {
    padding: 13px 14px;
  }
  .panel__cuerpo {
    padding: 14px;
    gap: 10px;
  }
}

@media (max-width: 480px) {
  .panel {
    border-radius: 10px;
  }
  .panel__cabecera {
    padding: 12px 14px 0;
    gap: 8px;
  }
  .panel__cabecera--borde {
    padding: 12px 14px;
  }
  .panel__titulo {
    font-size: 13px;
  }
  .panel__cuerpo {
    padding: 12px 14px;
    gap: 10px;
  }
}
</style>
