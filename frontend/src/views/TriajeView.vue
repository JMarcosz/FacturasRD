<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Select from 'primevue/select';
import AppLayout from '../components/AppLayout.vue';
import EncabezadoPantalla from '../components/ui/EncabezadoPantalla.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import TarjetaPanel from '../components/ui/TarjetaPanel.vue';
import AvatarIniciales from '../components/ui/AvatarIniciales.vue';
import { editarLote, confirmarClasificacionLote, listarFacturas } from '../api/facturas';
import { listarClientes, detectarDuplicados, fusionarClientes } from '../api/clientes';
import { apiReglas } from '../api/reglas';
import { fmtMonto, fmtFechaCorta } from '../formato';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import type { Cliente, Factura, GrupoDuplicado } from '../types';

const toast = useToast();

const facturas = ref<Factura[]>([]);
const clientes = ref<Cliente[]>([]);
const duplicados = ref<GrupoDuplicado[]>([]);
const cargando = ref(true);

const dialogoRegla = ref(false);
const guardandoRegla = ref(false);
const formRegla = ref({ rnc: '', nombre: '' });

function abrirDialogoRegla(rnc: string, nombre: string) {
  formRegla.value = { rnc, nombre };
  dialogoRegla.value = true;
}

async function guardarRegla() {
  guardandoRegla.value = true;
  try {
    await apiReglas.crear({ rnc: formRegla.value.rnc, nombre: formRegla.value.nombre, activo: true });
    toast.add({ severity: 'success', summary: 'Regla creada', life: 3000 });
    dialogoRegla.value = false;
  } catch(e: any) {
    toast.add({ severity: 'error', summary: 'Error al crear regla', life: 3000 });
  } finally {
    guardandoRegla.value = false;
  }
}

async function fusionar(grupo: GrupoDuplicado) {
  if (grupo.ids.length < 2) return;
  const idPrincipal = grupo.ids[0];
  const idsSecundarios = grupo.ids.slice(1);
  try {
    await fusionarClientes(idPrincipal, idsSecundarios);
    toast.add({ severity: 'success', summary: 'Clientes fusionados', life: 3000 });
    await cargar();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error al fusionar', life: 3000 });
  }
}

interface GrupoTriaje {
  rncEmisor: string;
  nombre: string;
  facturas: Factura[];
  clienteAsignado: string | null;
  clienteNombre: string | null;
  formatoAsignado: string | null;
  todasConfirmadas: boolean;
}

const grupos = computed<GrupoTriaje[]>(() => {
  const mapa = new Map<string, { nombre: string; facturas: Factura[] }>();

  for (const f of facturas.value) {
    const rnc = f.identificacionEmisor?.replace(/-/g, '') || 'SIN_RNC';
    const existente = mapa.get(rnc);
    if (existente) {
      existente.facturas.push(f);
    } else {
      mapa.set(rnc, { nombre: f.nombreEmisor ?? 'Sin nombre', facturas: [f] });
    }
  }

  return Array.from(mapa.entries()).map(([rnc, { nombre, facturas: fs }]) => ({
    rncEmisor: rnc,
    nombre,
    facturas: fs,
    clienteAsignado: fs[0].clienteId,
    clienteNombre: fs[0].cliente?.nombre ?? null,
    formatoAsignado: fs[0].formato,
    todasConfirmadas: fs.every((f) => f.clasificacionConfirmada),
  }));
});

const gruposSinClasificar = computed(() =>
  grupos.value.filter((g) => !g.clienteAsignado),
);
const gruposSugeridos = computed(() =>
  grupos.value.filter((g) => g.clienteAsignado && !g.todasConfirmadas),
);

const opcionesCliente = computed(() =>
  clientes.value
    .filter((c) => c.confirmado && c.activo)
    .map((c) => ({ label: c.nombre, value: c.id })),
);

async function cargar() {
  cargando.value = true;
  try {
    const [fs, cs, dups] = await Promise.all([
      listarFacturas({ estado: 'sin_clasificar' }),
      listarClientes(),
      detectarDuplicados()
    ]);
    const clasificadas = await listarFacturas({});
    const sinConfirmar = clasificadas.filter((f) => f.clienteId && !f.clasificacionConfirmada);
    facturas.value = [...fs, ...sinConfirmar];
    clientes.value = cs;
    duplicados.value = dups;
  } finally {
    cargando.value = false;
  }
}

async function asignarGrupo(grupo: GrupoTriaje, clienteId: string, formato: 'F606' | 'F607') {
  try {
    const ids = grupo.facturas.map((f) => f.id);
    await editarLote(ids, { clienteId, formato });
    await cargar();
    toast.add({ severity: 'success', summary: `${ids.length} facturas clasificadas`, life: 3000 });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 5000,
    });
  }
}

async function confirmarGrupo(grupo: GrupoTriaje) {
  try {
    const ids = grupo.facturas.map((f) => f.id);
    await confirmarClasificacionLote(ids);
    await cargar();
    toast.add({ severity: 'success', summary: `${ids.length} clasificaciones confirmadas`, life: 3000 });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 5000,
    });
  }
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <EncabezadoPantalla
      titulo="Triaje"
      subtitulo="Facturas agrupadas por comercio, listas para clasificar de un solo golpe."
    />

    <div v-if="cargando" class="cargando">
      <i class="pi pi-spin pi-spinner" style="font-size: 24px; color: var(--texto-tenue)"></i>
    </div>

    <template v-else>
      <TarjetaPanel
        v-if="duplicados.length > 0"
        :titulo="`Contribuyentes con RNC Casi Duplicados (${duplicados.length})`"
        subtitulo="Se detectaron registros similares. Considera fusionarlos."
      >
        <div class="grupos">
          <div v-for="dup in duplicados" :key="dup.nombre" class="grupo">
            <div class="grupo__cabecera">
              <AvatarIniciales :nombre="dup.nombre" />
              <div class="grupo__info">
                <span class="grupo__nombre">{{ dup.nombre }}</span>
                <span class="grupo__rnc">RNCs: {{ dup.rncs.join(', ') }}</span>
              </div>
            </div>
            <div class="grupo__acciones">
              <Button label="Fusionar contribuyentes" icon="pi pi-link" size="small" @click="fusionar(dup)" />
            </div>
          </div>
        </div>
      </TarjetaPanel>

      <div v-if="gruposSinClasificar.length === 0 && gruposSugeridos.length === 0 && duplicados.length === 0" class="vacio-global">
        <i class="pi pi-check-circle" style="font-size: 32px; color: var(--ok)"></i>
        <span>Todas las facturas están clasificadas y confirmadas.</span>
      </div>

      <TarjetaPanel
        v-if="gruposSinClasificar.length > 0"
        :titulo="`Sin clasificar (${gruposSinClasificar.length} grupos)`"
        subtitulo="Asigna un cliente y formato a cada grupo."
      >
        <div class="grupos">
          <div v-for="g in gruposSinClasificar" :key="g.rncEmisor" class="grupo">
            <div class="grupo__cabecera">
              <AvatarIniciales :nombre="g.nombre" />
              <div class="grupo__info">
                <span class="grupo__nombre">{{ g.nombre }}</span>
                <span class="grupo__rnc">{{ g.rncEmisor }} · {{ g.facturas.length }} facturas</span>
              </div>
              <Pastilla texto="Sin clasificar" tono="alerta" />
            </div>
            <div class="grupo__facturas">
              <div v-for="f in g.facturas.slice(0, 3)" :key="f.id" class="grupo__factura">
                <span class="grupo__ncf">{{ f.ncf || '—' }}</span>
                <span class="grupo__fecha">{{ fmtFechaCorta(f.fechaComprobante) }}</span>
                <span class="grupo__monto">{{ fmtMonto(f.montoFacturado) }}</span>
              </div>
              <span v-if="g.facturas.length > 3" class="grupo__mas">
                +{{ g.facturas.length - 3 }} más
              </span>
            </div>
            <div class="grupo__acciones">
              <Select
                :options="opcionesCliente"
                option-label="label"
                option-value="value"
                placeholder="Asignar cliente…"
                class="grupo__select"
                @change="(e: any) => asignarGrupo(g, e.value, 'F607')"
              />
              <Button label="Crear regla" icon="pi pi-sliders-h" size="small" severity="secondary" outlined @click="abrirDialogoRegla(g.rncEmisor, g.nombre)" />
            </div>
          </div>
        </div>
      </TarjetaPanel>

      <TarjetaPanel
        v-if="gruposSugeridos.length > 0"
        :titulo="`Sugeridas sin confirmar (${gruposSugeridos.length} grupos)`"
        subtitulo="Estas facturas fueron clasificadas automáticamente. Confirma para que puedan exportarse."
      >
        <div class="grupos">
          <div v-for="g in gruposSugeridos" :key="g.rncEmisor" class="grupo">
            <div class="grupo__cabecera">
              <AvatarIniciales :nombre="g.nombre" />
              <div class="grupo__info">
                <span class="grupo__nombre">{{ g.nombre }}</span>
                <span class="grupo__rnc">{{ g.rncEmisor }} · {{ g.facturas.length }} facturas · {{ g.clienteNombre }}</span>
              </div>
              <Pastilla :texto="g.formatoAsignado === 'F607' ? 'Ingreso · 607' : 'Gasto · 606'" :tono="g.formatoAsignado === 'F607' ? 'ok' : 'neutro'" />
              <Pastilla texto="Sin confirmar" tono="alerta" />
            </div>
            <div class="grupo__acciones">
              <Button label="Confirmar grupo" icon="pi pi-check" size="small" severity="success" @click="confirmarGrupo(g)" />
            </div>
          </div>
        </div>
      </TarjetaPanel>

      <Dialog v-model:visible="dialogoRegla" header="Crear Regla" modal :style="{ width: '400px' }">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 12px; font-weight: 600;">RNC</label>
            <InputText v-model="formRegla.rnc" style="width: 100%;" disabled />
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 600;">Nombre</label>
            <InputText v-model="formRegla.nombre" style="width: 100%;" />
          </div>
        </div>
        <template #footer>
          <Button label="Cancelar" text severity="secondary" @click="dialogoRegla = false" />
          <Button label="Crear" @click="guardarRegla" :loading="guardandoRegla" />
        </template>
      </Dialog>
    </template>
  </AppLayout>
</template>

<style scoped>
.cargando {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}
.vacio-global {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
  color: var(--texto-suave);
  font-size: 14px;
  font-weight: 500;
}
.grupos {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grupo {
  border: 1px solid var(--borde-tenue);
  border-radius: 11px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grupo__cabecera {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grupo__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.grupo__nombre {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--texto);
}
.grupo__rnc {
  font-size: 12px;
  color: var(--texto-suave);
}
.grupo__facturas {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 42px;
}
.grupo__factura {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--texto-medio);
}
.grupo__ncf {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  min-width: 120px;
}
.grupo__fecha {
  min-width: 80px;
}
.grupo__monto {
  font-weight: 600;
  color: var(--texto);
}
.grupo__mas {
  font-size: 11.5px;
  color: var(--texto-debil);
  font-weight: 500;
}
.grupo__acciones {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 42px;
}
.grupo__select {
  width: 260px;
}
</style>
