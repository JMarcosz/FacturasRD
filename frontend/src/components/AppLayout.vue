<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import { useAuthStore } from '../stores/auth';
import { aYyyymm, obtenerResumen } from '../api/estadisticas';
import { fmtYyyymm, pct } from '../formato';
import CintaProgreso from './ui/CintaProgreso.vue';
import type { ResumenEstadisticas } from '../types';

const props = withDefaults(
  defineProps<{
    mostrarBusqueda?: boolean;
    busqueda?: string;
    placeholderBusqueda?: string;
    /**
     * Pantallas de trabajo inmersivo (ej. Detalle de factura) necesitan
     * ocupar todo el alto disponible y manejar su propio scroll interno por
     * panel, en vez del scroll de página normal. Opt-in: el resto de las
     * vistas no lo pasan y siguen creciendo con su contenido como siempre.
     */
    pantallaCompleta?: boolean;
  }>(),
  { mostrarBusqueda: false, busqueda: '', placeholderBusqueda: 'Buscar NCF, RNC o comercio…', pantallaCompleta: false },
);

const emit = defineEmits<{ 'update:busqueda': [valor: string] }>();

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const resumen = ref<ResumenEstadisticas | null>(null);
// El componente InputText no expone `$el` en sus tipos, así que el atajo ⌘K
// busca el input real dentro del contenedor.
const buscadorRef = ref<HTMLElement | null>(null);

/**
 * Solo tiene efecto por debajo de 1024px: ahí la barra lateral deja de ocupar
 * su columna fija y pasa a deslizarse por encima del contenido. Por encima de
 * ese ancho el menú está siempre visible y este estado se ignora.
 */
const menuAbierto = ref(false);

interface ItemNav {
  label: string;
  icono: string;
  ruta?: string;
  contador?: () => number;
  tono?: 'alerta' | 'error';
}

const navGroups: Array<{ titulo: string; items: ItemNav[] }> = [
  {
    titulo: 'General',
    items: [
      { label: 'Dashboard', icono: 'pi-chart-bar', ruta: 'dashboard' },
      {
        label: 'Facturas',
        icono: 'pi-receipt',
        ruta: 'facturas',
        contador: () => resumen.value?.mes.sinClasificar ?? 0,
        tono: 'alerta',
      },
      // 'triaje' ya no es una ruta propia — ver el caso especial en ir()/activo():
      // la antigua pantalla se consolidó como un filtro dentro de Facturas.
      { label: 'Triaje', icono: 'pi-list-check', ruta: 'triaje' },
      { label: 'Clientes', icono: 'pi-users', ruta: 'clientes' },
    ],
  },
  {
    titulo: 'Cierre fiscal',
    items: [
      { label: 'Reportería', icono: 'pi-file-export', ruta: 'reporteria' },
      { label: 'Períodos', icono: 'pi-calendar-clock' },
    ],
  },
  {
    titulo: 'Sistema',
    items: [
      { label: 'Catálogos DGII', icono: 'pi-book' },
      { label: 'Configuración', icono: 'pi-cog' },
      { label: 'Reglas', icono: 'pi-sliders-h', ruta: 'reglas' },
    ],
  },
];

function activo(item: ItemNav): boolean {
  if (!item.ruta) return false;
  // Triaje es la cola "clasificada pero sin confirmar" dentro de Facturas, no
  // una ruta propia: se distingue por la vista activa, no por el nombre.
  if (item.ruta === 'triaje') return route.name === 'facturas' && route.query.vista === 'por_confirmar';
  if (item.ruta === 'facturas') {
    return (route.name === 'facturas' && route.query.vista !== 'por_confirmar') || route.name === 'factura-detalle';
  }
  if (item.ruta === 'reporteria') return route.name === 'reporteria';
  return route.name === item.ruta;
}

function ir(item: ItemNav) {
  if (item.ruta === 'triaje') {
    router.push({ name: 'facturas', query: { vista: 'por_confirmar' } });
    return;
  }
  if (item.ruta) router.push({ name: item.ruta });
}

const tituloPantalla = computed(() => (route.meta.titulo as string | undefined) ?? 'Facturas RD');

const rolLegible = computed(() => {
  if (auth.usuario?.rol === 'ADMIN') return 'Administrador';
  if (auth.usuario?.rol === 'CONTADOR') return 'Contador';
  return '';
});

const iniciales = computed(() =>
  (auth.usuario?.nombre ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join(''),
);

// Tarjeta "Período abierto": mes en curso, clientes con actividad y cuánto
// falta por clasificar.
const periodoAbierto = computed(() => {
  if (!resumen.value) return null;
  const m = resumen.value.mes;
  const clientes = resumen.value.porCliente.filter((c) => c.clienteId !== null).length;
  return {
    mes: fmtYyyymm(m.yyyymm),
    clientes,
    sinClasificar: m.sinClasificar,
    avance: pct(m.clasificadas, m.escaneadas),
  };
});

async function cargarResumen() {
  try {
    resumen.value = await obtenerResumen(aYyyymm(new Date()));
  } catch {
    // El sidebar no debe tumbar la pantalla si el resumen falla.
    resumen.value = null;
  }
}

function onAtajo(ev: KeyboardEvent) {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    buscadorRef.value?.querySelector('input')?.focus();
  }
  if (ev.key === 'Escape' && menuAbierto.value) menuAbierto.value = false;
}

function salir() {
  auth.cerrarSesion();
  router.push('/login');
}

onMounted(() => {
  cargarResumen();
  window.addEventListener('keydown', onAtajo);
});
onUnmounted(() => window.removeEventListener('keydown', onAtajo));

// Al cambiar de pantalla los contadores pueden haber cambiado (se clasificó,
// se borró, se revisó) — se refrescan sin que cada vista tenga que avisar.
// En móvil además se cierra el menú: navegar ES la señal de que terminaste con él.
watch(
  () => route.name,
  () => {
    cargarResumen();
    menuAbierto.value = false;
  },
);

defineExpose({ refrescarResumen: cargarResumen });
</script>

<template>
  <div class="marco">
    <a href="#contenido-principal" class="saltar-contenido">Ir al contenido</a>

    <!-- Solo existe cuando el menú está desplegado sobre el contenido (móvil):
         cerrar tocando fuera es el gesto que la gente intenta primero. -->
    <div v-if="menuAbierto" class="velo" @click="menuAbierto = false"></div>

    <aside class="lateral" :class="{ 'lateral--abierto': menuAbierto }">
      <RouterLink to="/dashboard" class="marca">
        <div class="marca__logo">FR</div>
        <div class="marca__texto">
          <span class="marca__nombre">Facturas RD</span>
          <span class="marca__sub">DGII 606 · 607</span>
        </div>
      </RouterLink>

      <nav class="nav">
        <div v-for="grupo in navGroups" :key="grupo.titulo" class="nav__grupo">
          <div class="nav__titulo">{{ grupo.titulo }}</div>
          <button
            v-for="item in grupo.items"
            :key="item.label"
            type="button"
            :disabled="!item.ruta"
            class="nav__item"
            :class="{ 'nav__item--activo': activo(item), 'nav__item--inerte': !item.ruta }"
            @click="ir(item)"
          >
            <i
              class="pi"
              :class="item.icono"
              :style="{ fontSize: '13.5px', width: '16px', color: activo(item) ? 'var(--teal)' : 'var(--texto-debil)' }"
            ></i>
            <span style="flex: 1">{{ item.label }}</span>
            <span
              v-if="item.contador && item.contador() > 0"
              class="nav__contador"
              :style="
                item.tono === 'error'
                  ? { background: 'var(--error-fondo)', color: 'var(--error)' }
                  : { background: 'var(--alerta-fondo)', color: 'var(--alerta)' }
              "
            >
              {{ item.contador() }}
            </span>
          </button>
        </div>
      </nav>

      <div class="pie">
        <div v-if="periodoAbierto" class="periodo">
          <div class="periodo__titulo"><i class="pi pi-calendar" style="font-size: 12px"></i>Período abierto</div>
          <div class="periodo__detalle">
            {{ periodoAbierto.mes }} · {{ periodoAbierto.clientes }}
            {{ periodoAbierto.clientes === 1 ? 'cliente' : 'clientes' }}<br />
            <strong>{{ periodoAbierto.sinClasificar }}</strong> facturas sin clasificar
          </div>
          <div class="periodo__barra">
            <div class="periodo__relleno" :style="{ width: `${periodoAbierto.avance}%` }"></div>
          </div>
        </div>

        <div class="usuario">
          <div class="usuario__avatar">{{ iniciales || '·' }}</div>
          <div class="usuario__texto">
            <span class="usuario__nombre">{{ auth.usuario?.nombre ?? '—' }}</span>
            <span class="usuario__rol">{{ rolLegible }}</span>
          </div>
          <button type="button" class="usuario__salir" title="Cerrar sesión" aria-label="Cerrar sesión" @click="salir">
            <i class="pi pi-sign-out"></i>
          </button>
        </div>
      </div>
    </aside>

    <div class="contenido">
      <header class="topbar">
        <button
          type="button"
          class="hamburguesa"
          :aria-expanded="menuAbierto"
          aria-label="Abrir menú de navegación"
          @click="menuAbierto = !menuAbierto"
        >
          <i class="pi" :class="menuAbierto ? 'pi-times' : 'pi-bars'"></i>
        </button>
        <div class="miga">
          <i class="pi pi-home" style="font-size: 12.5px"></i>
          <i class="pi pi-angle-right" style="font-size: 11px"></i>
          <span class="miga__actual">{{ tituloPantalla }}</span>
        </div>
        <div style="flex: 1"></div>
        <IconField v-if="props.mostrarBusqueda" ref="buscadorRef" class="buscador">
          <InputIcon class="pi pi-search" />
          <InputText
            :model-value="props.busqueda"
            :placeholder="props.placeholderBusqueda"
            @update:model-value="(v) => emit('update:busqueda', v ?? '')"
          />
          <span class="buscador__atajo">⌘K</span>
        </IconField>
        <slot name="acciones" />
      </header>

      <!-- No en pantallas de pantalla completa (Detalle de factura): ahí la
           altura fija de `.principal--completa` ya está calculada para el
           alto exacto de la topbar, y la cinta rompería esa cuenta. -->
      <CintaProgreso v-if="!props.pantallaCompleta" :resumen="resumen" />

      <main id="contenido-principal" class="principal" :class="{ 'principal--completa': props.pantallaCompleta }" tabindex="-1">
        <slot :resumen="resumen" :refrescar-resumen="cargarResumen" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.marco {
  display: flex;
  min-height: 100vh;
  background: var(--fondo);
}

/* ── Sidebar ── */
.lateral {
  width: 238px;
  flex: 0 0 238px;
  background: var(--superficie-alt);
  border-right: 1px solid var(--borde);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
}
.marca {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 18px;
  text-decoration: none;
}
.marca:hover {
  text-decoration: none;
}
.marca__logo {
  width: 30px;
  height: 30px;
  border-radius: var(--radio-control);
  background: var(--teal);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.5px;
}
.marca__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.marca__nombre {
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--texto);
}
.marca__sub {
  font-size: 10.5px;
  color: var(--texto-tenue);
  font-weight: 500;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 12px;
  overflow-y: auto;
  flex: 1;
}
.nav__grupo {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav__titulo {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.9px;
  color: var(--texto-debil);
  padding: 0 10px 6px;
  text-transform: uppercase;
}
.nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 8px;
  font-weight: 500;
  background: transparent;
  color: #525a67;
}
.nav__item:hover:not(.nav__item--inerte) {
  background: #f0f2f4;
}
.nav__item--activo {
  background: #eef2f1;
  color: #0f4f49;
  font-weight: 600;
}
.nav__item--inerte {
  cursor: default;
  color: #b9bfc9;
}
.nav__contador {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: var(--radio-chip);
}

.pie {
  padding: 12px;
  border-top: 1px solid #eceef1;
}
.periodo {
  background: var(--teal-suave);
  border: 1px solid var(--teal-borde);
  border-radius: 10px;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.periodo__titulo {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--teal);
}
.periodo__detalle {
  font-size: 12px;
  color: var(--texto-medio);
  line-height: 1.4;
}
.periodo__detalle strong {
  color: var(--texto);
}
.periodo__barra {
  height: 5px;
  border-radius: var(--radio-chip);
  background: #d7f5ee;
  overflow: hidden;
}
.periodo__relleno {
  height: 100%;
  background: var(--teal);
  border-radius: var(--radio-chip);
}
.usuario {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 4px 2px;
}
.usuario__avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radio-chip);
  background: #e0e7ff;
  color: var(--indigo);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  flex: none;
}
.usuario__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  flex: 1;
  min-width: 0;
}
.usuario__nombre {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usuario__rol {
  font-size: 10.5px;
  color: var(--texto-tenue);
}
.usuario__salir {
  border: 0;
  background: transparent;
  padding: 4px;
  font-size: 12.5px;
  color: var(--texto-tenue);
  cursor: pointer;
  border-radius: 6px;
  display: grid;
  place-items: center;
}
.usuario__salir:hover {
  color: var(--error);
}

/* ── Contenido ── */
.contenido {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(251, 251, 252, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--borde);
  padding: 0 22px;
  height: 58px;
  display: flex;
  align-items: center;
  gap: 16px;
}
/* Oculta por defecto: sobre 1024px el menú está siempre a la vista y un botón
   para abrirlo no significaría nada. */
.hamburguesa {
  display: none;
  width: 36px;
  height: 36px;
  flex: none;
  border: 1px solid var(--borde);
  background: var(--superficie);
  border-radius: var(--radio-control);
  place-items: center;
  cursor: pointer;
  color: var(--texto-medio);
  font-size: 15px;
}
.hamburguesa:hover {
  border-color: var(--borde-fuerte);
  color: var(--teal);
}
.miga {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--texto-tenue);
  min-width: 0;
}
.velo {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(16, 20, 26, 0.45);
}
.miga__actual {
  color: var(--texto);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.buscador {
  width: 268px;
}
.buscador :deep(input) {
  width: 100%;
  font-size: 12.5px;
  padding-right: 42px;
}
.buscador__atajo {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #b9bfc9;
  border: 1px solid var(--borde);
  border-radius: 4px;
  padding: 1px 5px;
  font-weight: 600;
  pointer-events: none;
}
.principal {
  flex: 1;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
/* .topbar mide 58px de alto (fijo, ver arriba) — el cálculo se apoya en ese
   número para que el panel ocupe exactamente el resto del viewport. */
.principal--completa {
  padding: 0;
  gap: 0;
  height: calc(100vh - 58px);
  overflow: hidden;
}
/* La vista que use pantallaCompleta trae su propio fallback de vuelta al
   flujo normal en este mismo punto de quiebre — sin este, quedaría atrapada
   dentro de una altura fija aunque su contenido ya decidió expandirse. */
@media (max-width: 1200px) {
  .principal--completa {
    height: auto;
    overflow: visible;
  }
}

/* ── Menú contraíble ──────────────────────────────────────────────────────
   Bajo 1024px la lateral deja de ser una columna del flex y se convierte en
   un panel que se desliza por encima. `visibility` (no solo el translate)
   es lo que la saca del recorrido del tabulador cuando está cerrada: un menú
   invisible pero enfocable manda el foco fuera de la pantalla. */
@media (max-width: 1024px) {
  .lateral {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 50;
    transform: translateX(-100%);
    visibility: hidden;
    transition: transform 0.22s ease, visibility 0.22s;
    box-shadow: 0 10px 40px rgba(16, 20, 26, 0.16);
  }
  .lateral--abierto {
    transform: translateX(0);
    visibility: visible;
  }
  .hamburguesa {
    display: grid;
  }
  .topbar {
    padding: 0 14px;
    gap: 12px;
  }
  .principal {
    padding: 16px;
  }
}

@media (max-width: 768px) {
  /* El buscador deja de competir por el ancho con la miga de pan: baja a su
     propia fila, completa. */
  .topbar {
    height: auto;
    flex-wrap: wrap;
    padding: 10px 14px;
  }
  .buscador {
    width: 100%;
    order: 3;
  }
  .principal {
    padding: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lateral {
    transition: none;
  }
}
</style>
