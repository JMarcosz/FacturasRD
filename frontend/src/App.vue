<script setup lang="ts">
import { useRouter } from 'vue-router';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';

const router = useRouter();

/**
 * Acción opcional que cualquier pantalla puede adjuntar a un toast vía
 * `toast.add({ ..., data: { accion: { label, ruta } } })`. Es lo que conecta
 * el resultado de una acción en lote con el paso siguiente del flujo
 * (Importar → Clasificar → Confirmar → Descargar) sin que cada pantalla
 * tenga que montar su propio aviso a medida.
 */
interface AccionToast {
  label: string;
  ruta: { name: string; query?: Record<string, string> };
}

function irAccion(accion: AccionToast) {
  router.push(accion.ruta);
}
</script>

<template>
  <RouterView />
  <!-- Montados una sola vez en la raíz: `useToast`/`useConfirm` de cualquier
       pantalla escriben aquí. -->
  <Toast position="top-right">
    <template #message="{ message }">
      <div class="toast-cuerpo" role="status" aria-live="polite">
        <span class="toast-resumen">{{ message.summary }}</span>
        <span v-if="message.detail" class="toast-detalle">{{ message.detail }}</span>
        <button
          v-if="(message.data as { accion?: AccionToast })?.accion"
          type="button"
          class="toast-accion"
          @click="irAccion((message.data as { accion: AccionToast }).accion)"
        >
          {{ (message.data as { accion: AccionToast }).accion.label }}
          <i class="pi pi-arrow-right" style="font-size: 10px"></i>
        </button>
      </div>
    </template>
  </Toast>
  <ConfirmDialog />
</template>

<style>
.toast-cuerpo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.toast-resumen {
  font-weight: 600;
}
.toast-detalle {
  font-size: 12.5px;
  opacity: 0.9;
}
.toast-accion {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-top: 4px;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.toast-accion:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
