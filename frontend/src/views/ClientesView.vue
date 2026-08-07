<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import AppLayout from '../components/AppLayout.vue';
import EncabezadoPantalla from '../components/ui/EncabezadoPantalla.vue';
import TarjetaPanel from '../components/ui/TarjetaPanel.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import AvatarIniciales from '../components/ui/AvatarIniciales.vue';
import ImportarClientesDialog from '../components/ImportarClientesDialog.vue';
import { confirmarCliente, crearCliente, descartarCliente, listarClientes, reclasificarFacturas } from '../api/clientes';
import { aYyyymm, obtenerResumen } from '../api/estadisticas';
import { fmtMontoCorto, fmtYyyymm } from '../formato';
import { useCatalogosStore } from '../stores/catalogos';
import type { Cliente, RollupCliente } from '../types';

type Tono = 'ok' | 'alerta' | 'error' | 'info' | 'indigo' | 'neutro' | 'teal';

interface TarjetaCliente {
  id: string;
  nombre: string;
  rnc: string;
  estadoTexto: string;
  estadoTono: Tono;
  facturas: number;
  itbis: string;
  tasa: string;
  chips: string[];
}

const router = useRouter();
const toast = useToast();
const catalogos = useCatalogosStore();

const clientes = ref<Cliente[]>([]);
const rollups = ref<RollupCliente[]>([]);
const cargando = ref(true);
const errorCarga = ref('');

// El mes se fija al montar para que las métricas de todas las tarjetas hablen
// siempre del mismo período aunque la pantalla quede abierta.
const yyyymm = ref(aYyyymm(new Date()));
const mesLegible = computed(() => fmtYyyymm(yyyymm.value).toLowerCase());

const tiposIngreso = computed(() => catalogos.etiquetar(catalogos.catalogos.tiposIngreso607));

/** Rollup del mes indexado por cliente: un cliente sin actividad no viene en la respuesta. */
const rollupPorCliente = computed(() => {
  const mapa = new Map<string, RollupCliente>();
  for (const r of rollups.value) if (r.clienteId) mapa.set(r.clienteId, r);
  return mapa;
});

const clientesManuales = computed(() =>
  clientes.value.filter((c) => c.origen === 'MANUAL' || c.confirmado),
);
const clientesAutoDetectados = computed(() =>
  clientes.value.filter((c) => c.origen === 'AUTO' && !c.confirmado),
);

const tarjetas = computed<TarjetaCliente[]>(() =>
  clientesManuales.value.map((c) => {
    const r = rollupPorCliente.value.get(c.id);
    const errores = r?.conErrorValidacion ?? 0;
    return {
      id: c.id,
      nombre: c.nombre,
      rnc: c.rnc,
      estadoTexto: textoEstado(c.activo, errores),
      estadoTono: tonoEstado(c.activo, errores),
      facturas: r?.escaneadas ?? 0,
      itbis: fmtMontoCorto(r?.itbisFacturado ?? 0),
      tasa: `${Math.round(Number(c.tasaItbis) * 100)}%`,
      chips: chipsFiscales(c),
    };
  }),
);

function textoEstado(activo: boolean, errores: number): string {
  if (!activo) return 'Inactivo';
  if (errores > 0) return errores === 1 ? '1 error' : `${errores} errores`;
  return 'Activo';
}

function tonoEstado(activo: boolean, errores: number): Tono {
  if (!activo) return 'neutro';
  return errores > 0 ? 'error' : 'ok';
}

function chipsFiscales(c: Cliente): string[] {
  const chips: string[] = [];
  if (c.aplicaProporcionalidad) chips.push('Proporcionalidad');
  if (c.tipoIngresoDefault) {
    chips.push(`Ingreso ${catalogos.descripcion(catalogos.catalogos.tiposIngreso607, c.tipoIngresoDefault)}`);
  }
  if (!chips.length) chips.push('Sin tipo de ingreso por defecto');
  return chips;
}

function abrir(id: string) {
  router.push({ name: 'facturas', query: { clienteId: id } });
}

// ── Confirmación Auto-detectados ────────────────────────────────────────────
const confirmando = ref<string | null>(null);
const tipoIngresoConfirmar = ref('01');

async function onConfirmarCliente(id: string) {
  try {
    await confirmarCliente(id, tipoIngresoConfirmar.value);
    const resultado = await reclasificarFacturas(id);
    await cargar();
    confirmando.value = null;
    toast.add({
      severity: 'success',
      summary: 'Cliente confirmado',
      detail: resultado.reclasificadas > 0
        ? `${resultado.reclasificadas} facturas reclasificadas automáticamente.`
        : undefined,
      life: 5000,
    });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Error al confirmar',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 5000,
    });
  }
}

async function onDescartarCliente(id: string) {
  try {
    await descartarCliente(id);
    await cargar();
    toast.add({ severity: 'info', summary: 'Cliente descartado', life: 3000 });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Error al descartar',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 5000,
    });
  }
}

// ── Alta de cliente ──────────────────────────────────────────────────────────
const dialogo = ref(false);
const dialogoImportar = ref(false);
const guardando = ref(false);
const errorForm = ref('');

// La tasa se edita en porcentaje (18) porque es como se lee en la tarjeta y en
// la ley; al backend viaja como fracción (0.18).
const form = reactive({
  rnc: '',
  nombre: '',
  tipoIngresoDefault: null as string | null,
  tasaPct: 18 as number,
  aplicaProporcionalidad: false,
});

function abrirDialogo() {
  form.rnc = '';
  form.nombre = '';
  form.tipoIngresoDefault = null;
  form.tasaPct = 18;
  form.aplicaProporcionalidad = false;
  errorForm.value = '';
  dialogo.value = true;
}

async function guardar() {
  errorForm.value = '';
  if (!form.rnc.trim() || !form.nombre.trim()) {
    errorForm.value = 'El RNC y el nombre son obligatorios.';
    return;
  }
  guardando.value = true;
  try {
    const creado = await crearCliente({
      rnc: form.rnc.trim(),
      nombre: form.nombre.trim(),
      tipoIngresoDefault: form.tipoIngresoDefault ?? undefined,
      tasaItbis: Number(((form.tasaPct ?? 0) / 100).toFixed(4)),
      aplicaProporcionalidad: form.aplicaProporcionalidad,
    });
    dialogo.value = false;
    toast.add({ severity: 'success', summary: 'Cliente creado', detail: creado.nombre, life: 3000 });
    await cargar();
  } catch (e: unknown) {
    // El dígito verificador del RNC lo valida el servidor: su mensaje es el útil.
    errorForm.value = mensajeError(e, 'No se pudo crear el cliente.');
  } finally {
    guardando.value = false;
  }
}

function mensajeError(e: unknown, porDefecto: string): string {
  const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(' · ');
  return msg ?? porDefecto;
}

async function cargar() {
  cargando.value = true;
  errorCarga.value = '';
  try {
    clientes.value = await listarClientes();
  } catch (e: unknown) {
    errorCarga.value = mensajeError(e, 'No se pudo cargar la lista de clientes.');
    clientes.value = [];
  } finally {
    cargando.value = false;
  }
  // Las métricas son accesorias: si el resumen falla, las tarjetas siguen
  // mostrándose con ceros en vez de dejar la pantalla vacía.
  try {
    const resumen = await obtenerResumen(yyyymm.value);
    rollups.value = resumen.porCliente;
    yyyymm.value = resumen.mes.yyyymm;
  } catch {
    rollups.value = [];
  }
}

onMounted(() => {
  catalogos.cargar();
  cargar();
});
</script>

<template>
  <AppLayout>
    <!-- El Toast global vive en App.vue: montar otro aquí duplicaba cada aviso. -->
    <div class="clientes">
      <EncabezadoPantalla
        titulo="Clientes"
        subtitulo="Configuración fiscal por contribuyente: ITBIS, proporcionalidad y tipo de ingreso."
      >
        <template #acciones>
          <button type="button" class="boton-primario" style="background: var(--superficie); color: var(--texto); border: 1px solid var(--borde);" @click="dialogoImportar = true">
            <i class="pi pi-upload" style="margin-right: 4px;"></i> Importar en bloque
          </button>
          <button type="button" class="boton-primario" @click="abrirDialogo">+ Nuevo cliente</button>
        </template>
      </EncabezadoPantalla>

      <!-- Clientes auto-detectados -->
      <TarjetaPanel
        v-if="clientesAutoDetectados.length > 0"
        :titulo="`Detectados automáticamente (${clientesAutoDetectados.length})`"
        subtitulo="Comercios encontrados en las facturas. Confirma los que son tus contribuyentes."
      >
        <div class="detectados">
          <div v-for="c in clientesAutoDetectados" :key="c.id" class="detectado">
            <div class="detectado__info">
              <AvatarIniciales :nombre="c.nombre" />
              <div class="detectado__texto">
                <span class="detectado__nombre">{{ c.nombre }}</span>
                <span class="detectado__rnc">
                  {{ c.rnc }}
                  <Pastilla v-if="!c.rncVerificado" texto="RNC sin verificar" tono="alerta" />
                </span>
              </div>
            </div>
            <div v-if="confirmando === c.id" class="detectado__confirmar">
              <label class="detectado__campo">
                <span>Tipo de ingreso</span>
                <Select
                  v-model="tipoIngresoConfirmar"
                  :options="catalogos.catalogos.tiposIngreso607.map((t) => ({ label: `${t.codigo} · ${t.descripcion}`, value: t.codigo }))"
                  option-label="label"
                  option-value="value"
                  class="detectado__select"
                />
              </label>
              <div class="detectado__botones">
                <Button label="Confirmar" icon="pi pi-check" size="small" @click="onConfirmarCliente(c.id)" />
                <Button label="Cancelar" severity="secondary" outlined size="small" @click="confirmando = null" />
              </div>
            </div>
            <div v-else class="detectado__acciones">
              <Button label="Confirmar como contribuyente" icon="pi pi-check" size="small" severity="success" @click="confirmando = c.id" />
              <Button label="Descartar" icon="pi pi-times" size="small" severity="secondary" outlined @click="onDescartarCliente(c.id)" />
            </div>
          </div>
        </div>
      </TarjetaPanel>

      <TarjetaPanel v-if="cargando" class="aviso">Cargando los clientes…</TarjetaPanel>

      <TarjetaPanel v-else-if="errorCarga">
        <div class="aviso__error">
          <i class="pi pi-exclamation-circle"></i>
          <span>{{ errorCarga }}</span>
          <button type="button" class="enlace" @click="cargar()">Reintentar</button>
        </div>
      </TarjetaPanel>

      <TarjetaPanel v-else-if="!tarjetas.length">
        <div class="vacio">
          <div class="vacio__icono"><i class="pi pi-users"></i></div>
          <span class="vacio__titulo">Aún no hay clientes</span>
          <span class="vacio__texto">
            Cada factura se declara bajo un contribuyente. Registra el primero con su RNC, su tasa de ITBIS y el tipo
            de ingreso que usa por defecto en el 607.
          </span>
          <button type="button" class="boton-primario" @click="abrirDialogo">+ Nuevo cliente</button>
        </div>
      </TarjetaPanel>

      <div v-else class="rejilla">
        <button v-for="c in tarjetas" :key="c.id" type="button" class="tarjeta" @click="abrir(c.id)">
          <div class="tarjeta__cabecera">
            <AvatarIniciales :nombre="c.nombre" :tamano="38" :radio="10" />
            <div class="tarjeta__identidad">
              <span class="tarjeta__nombre">{{ c.nombre }}</span>
              <span class="tarjeta__rnc">RNC {{ c.rnc }}</span>
            </div>
            <Pastilla :texto="c.estadoTexto" :tono="c.estadoTono" />
          </div>

          <div class="metricas">
            <div class="metrica">
              <span class="metrica__label">Facturas</span>
              <span class="metrica__valor">{{ c.facturas }}</span>
            </div>
            <div class="metrica">
              <span class="metrica__label">ITBIS mes</span>
              <span class="metrica__valor">{{ c.itbis }}</span>
            </div>
            <div class="metrica">
              <span class="metrica__label">Tasa</span>
              <span class="metrica__valor">{{ c.tasa }}</span>
            </div>
          </div>

          <div class="chips">
            <span v-for="chip in c.chips" :key="chip" class="chip">{{ chip }}</span>
          </div>
        </button>
      </div>

      <p v-if="!cargando && !errorCarga && tarjetas.length" class="pie">
        Facturas e ITBIS corresponden a {{ mesLegible }}.
      </p>
    </div>

    <Dialog
      v-model:visible="dialogo"
      modal
      header="Nuevo cliente"
      :draggable="false"
      :style="{ width: '540px' }"
      :breakpoints="{ '640px': '92vw' }"
    >
      <form class="form" @submit.prevent="guardar">
        <div class="form__campo">
          <label for="cli-rnc">RNC</label>
          <InputText id="cli-rnc" v-model="form.rnc" autocomplete="off" placeholder="130456789" />
        </div>
        <div class="form__campo">
          <label for="cli-nombre">Nombre o razón social</label>
          <InputText id="cli-nombre" v-model="form.nombre" autocomplete="off" placeholder="Constructora del Este SRL" />
        </div>
        <div class="form__campo form__campo--ancho">
          <label for="cli-ingreso">Tipo de ingreso (607) por defecto</label>
          <Select
            id="cli-ingreso"
            v-model="form.tipoIngresoDefault"
            :options="tiposIngreso"
            option-label="etiqueta"
            option-value="codigo"
            placeholder="Sin definir"
            show-clear
          />
        </div>
        <div class="form__campo">
          <label for="cli-tasa">Tasa de ITBIS</label>
          <InputNumber
            id="cli-tasa"
            v-model="form.tasaPct"
            suffix=" %"
            :min="0"
            :max="100"
            :max-fraction-digits="2"
          />
        </div>
        <div class="form__campo form__campo--casilla">
          <Checkbox v-model="form.aplicaProporcionalidad" input-id="cli-prop" binary />
          <label for="cli-prop">Aplica proporcionalidad de ITBIS</label>
        </div>

        <Message v-if="errorForm" severity="error" :closable="false" class="form__error">{{ errorForm }}</Message>
      </form>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="guardando" @click="dialogo = false" />
        <Button label="Guardar cliente" :loading="guardando" @click="guardar" />
      </template>
    </Dialog>

    <ImportarClientesDialog v-model:visible="dialogoImportar" @importado="cargar" />
  </AppLayout>
</template>

<style scoped>
.clientes {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.boton-primario {
  border: 0;
  background: var(--teal);
  color: #fff;
  border-radius: var(--radio-control);
  padding: 9px 15px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.boton-primario:hover {
  background: var(--teal-oscuro);
}

.enlace {
  border: 0;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--teal);
  cursor: pointer;
}
.enlace:hover {
  color: var(--teal-oscuro);
}

/* ── Rejilla de tarjetas ── */
.rejilla {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.tarjeta {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  min-width: 0;
  text-align: left;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}
.tarjeta:hover {
  border-color: var(--teal);
}
.tarjeta__cabecera {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
  width: 100%;
}
.tarjeta__identidad {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.tarjeta__nombre {
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tarjeta__rnc {
  font-size: 11.5px;
  color: var(--texto-debil);
}

.metricas {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  padding: 11px 0;
  border-top: 1px solid var(--borde-tenue);
  border-bottom: 1px solid var(--borde-tenue);
}
.metrica {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.metrica__label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--texto-debil);
}
.metrica__valor {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
}
.chip {
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 6px;
  padding: 3px 8px;
  background: #f4f5f7;
  color: var(--texto-suave);
}

.pie {
  margin: 0;
  font-size: 11.5px;
  color: var(--texto-debil);
}

/* ── Formulario del diálogo ── */
.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.form__campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.form__campo--ancho {
  grid-column: 1 / -1;
}
.form__campo--casilla {
  flex-direction: row;
  align-items: center;
  gap: 9px;
  align-self: end;
  padding-bottom: 8px;
}
.form__campo label {
  font-size: 11px;
  font-weight: 700;
  color: var(--texto-suave);
}
.form__campo--casilla label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--texto-medio);
  cursor: pointer;
}
.form__error {
  grid-column: 1 / -1;
}

/* ── Estados de carga, error y vacío ── */
.aviso {
  font-size: 13px;
  color: var(--texto-suave);
}
.aviso__error {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--error);
  font-size: 13px;
}
.vacio {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 34px 16px;
}
.vacio__icono {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: var(--teal-suave);
  color: var(--teal);
  font-size: 19px;
}
.vacio__titulo {
  font-size: 15px;
  font-weight: 700;
}
.vacio__texto {
  font-size: 12.5px;
  color: var(--texto-suave);
  max-width: 430px;
  line-height: 1.5;
}
.vacio .boton-primario {
  margin-top: 4px;
}

/* ── Detectados ── */
.detectados {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detectado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--borde-tenue);
  border-radius: 11px;
  flex-wrap: wrap;
}
.detectado__info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 200px;
}
.detectado__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detectado__nombre {
  font-weight: 600;
  font-size: 13px;
  color: var(--texto);
}
.detectado__rnc {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--texto-suave);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.detectado__acciones {
  display: flex;
  gap: 8px;
}
.detectado__confirmar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.detectado__campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--texto-suave);
}
.detectado__select {
  width: 280px;
}
.detectado__botones {
  display: flex;
  gap: 6px;
}
</style>
