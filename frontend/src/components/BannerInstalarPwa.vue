<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const puedeInstalar = ref(false);
const instalado = ref(false);
let eventoInstalacion: any = null;

function capturarEvento(e: Event) {
  e.preventDefault();
  eventoInstalacion = e;
  puedeInstalar.value = true;
}

function appInstalada() {
  puedeInstalar.value = false;
  instalado.value = true;
  eventoInstalacion = null;
}

async function instalarApp() {
  if (!eventoInstalacion) return;
  eventoInstalacion.prompt();
  const { outcome } = await eventoInstalacion.userChoice;
  if (outcome === 'accepted') {
    puedeInstalar.value = false;
  }
  eventoInstalacion = null;
}

function descartar() {
  puedeInstalar.value = false;
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', capturarEvento);
  window.addEventListener('appinstalled', appInstalada);
});

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', capturarEvento);
  window.removeEventListener('appinstalled', appInstalada);
});
</script>

<template>
  <transition name="slide-fade">
    <aside v-if="puedeInstalar" class="banner-pwa" role="region" aria-label="Instalar aplicación Facturas RD">
      <div class="banner-pwa__icono">
        <i class="pi pi-download"></i>
      </div>
      <div class="banner-pwa__contenido">
        <span class="banner-pwa__titulo">Instalar Facturas RD</span>
        <span class="banner-pwa__sub">Accede más rápido desde tu pantalla de inicio y trabaja sin conexión.</span>
      </div>
      <div class="banner-pwa__acciones">
        <button type="button" class="banner-pwa__btn-instalar" @click="instalarApp">
          Instalar
        </button>
        <button type="button" class="banner-pwa__btn-cerrar" aria-label="Cerrar aviso" @click="descartar">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </aside>
  </transition>
</template>

<style scoped>
.banner-pwa {
  position: fixed;
  bottom: calc(var(--sab, 0px) + 72px);
  right: 18px;
  z-index: 1000;
  background: var(--superficie, #ffffff);
  border: 1px solid var(--teal-borde, #ccfbf1);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 10px 30px rgba(15, 118, 110, 0.18), 0 2px 6px rgba(0, 0, 0, 0.06);
  max-width: 400px;
}

.banner-pwa__icono {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--teal-suave, #f0fdfa);
  color: var(--teal, #0f766e);
  display: grid;
  place-items: center;
  font-size: 15px;
  flex: none;
}

.banner-pwa__contenido {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.banner-pwa__titulo {
  font-size: 13px;
  font-weight: 700;
  color: var(--texto, #16181d);
}

.banner-pwa__sub {
  font-size: 11px;
  color: var(--texto-suave, #6b7280);
  line-height: 1.35;
}

.banner-pwa__acciones {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.banner-pwa__btn-instalar {
  background: var(--teal, #0f766e);
  color: #ffffff;
  border: 0;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease;
}

.banner-pwa__btn-instalar:hover {
  background: var(--teal-oscuro, #115e59);
}

.banner-pwa__btn-cerrar {
  background: transparent;
  border: 0;
  color: var(--texto-tenue, #8b929e);
  padding: 4px;
  cursor: pointer;
  font-size: 12px;
  border-radius: 6px;
}

.banner-pwa__btn-cerrar:hover {
  color: var(--texto, #16181d);
}

@media (max-width: 640px) {
  .banner-pwa {
    left: 12px;
    right: 12px;
    bottom: calc(var(--sab, 0px) + 70px);
    max-width: none;
  }
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(16px);
  opacity: 0;
}
</style>
