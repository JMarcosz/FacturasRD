<script setup lang="ts">
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
</script>

<template>
  <RouterView />
  <!-- Montados una sola vez en la raíz: `useToast`/`useConfirm` de cualquier
       pantalla escriben aquí. -->
  <Toast position="top-right" />
  <ConfirmDialog />
</template>
