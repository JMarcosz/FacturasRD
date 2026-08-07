<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Select from 'primevue/select';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import AppLayout from '../components/AppLayout.vue';
import VisorDocumento from '../components/VisorDocumento.vue';
import EncabezadoPantalla from '../components/ui/EncabezadoPantalla.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import { actualizarFactura, editarLote, eliminarLote, listarFacturasPorPeriodo, revisarLote } from '../api/facturas';
import { obtenerPeriodo } from '../api/periodos';
import { listarClientes } from '../api/clientes';
import { useCatalogosStore } from '../stores/catalogos';
import { fmtMonto, fmtYyyymm, pct } from '../formato';
import type { Cliente, Factura, Periodo, ResultadoLote } from '../types';

const props = defineProps<{ periodoId: string }>();

const toast = useToast();
const confirm = useConfirm();
const catalogos = useCatalogosStore();

const periodo = ref<Periodo | null>(null);
const facturas = ref<Factura[]>([]);
const clientes = ref<Cliente[]>([]);
const seleccion = ref<Factura[]>([]);
const cargando = ref(true);
const aplicando = ref(false);
const indice = ref(0);

type Filtro = 'todas' | 'error' | 'dudosa';
const filtro = ref<Filtro>('todas');

function errores(f: Factura): number {
  return (f.validaciones ?? []).filter((v) => v.severidad === 'ERROR').length;
}
function advertencias(f: Factura): number {
  return (f.validaciones ?? []).filter((v) => v.severidad === 'WARNING').length;
}

const conError = computed(() => facturas.value.filter((f) => errores(f) > 0));
const dudosas = computed(() => facturas.value.filter((f) => errores(f) === 0 && advertencias(f) > 0));
const correctas = computed(() => facturas.value.filter((f) => errores(f) === 0 && advertencias(f) === 0));
const revisadas = computed(() => facturas.value.filter((f) => f.revisada).length);

const visibles = computed(() => {
  if (filtro.value === 'error') return conError.value;
  if (filtro.value === 'dudosa') return dudosas.value;
  return facturas.value;
});

const facturaActual = computed(() => visibles.value[indice.value] ?? null);

// El catálogo editable depende del formato del período: en 607 se clasifica el
// tipo de ingreso; en 606, el tipo de bienes y servicios.
const esVenta = computed(() => periodo.value?.formato === 'F607');
const catalogoClasificacion = computed(() =>
  esVenta.value ? catalogos.catalogos.tiposIngreso607 : catalogos.catalogos.tiposBienesServicios606,
);
const campoClasificacion = computed(() => (esVenta.value ? 'tipoIngreso' : 'tipoBienesServicios'));

function valorClasificacion(f: Factura): string | null {
  return esVenta.value ? f.tipoIngreso : f.tipoBienesServicios;
}

async function cargar() {
  cargando.value = true;
  try {
    const [p, f] = await Promise.all([obtenerPeriodo(props.periodoId), listarFacturasPorPeriodo(props.periodoId)]);
    periodo.value = p;
    facturas.value = f;
  } finally {
    cargando.value = false;
  }
}

function reemplazar(actualizada: Factura) {
  const pos = facturas.value.findIndex((f) => f.id === actualizada.id);
  if (pos !== -1) facturas.value[pos] = actualizada;
}

async function guardarCelda(evento: { data: Factura; newValue: unknown; field: string }) {
  const valor = (evento.newValue as string) || null;
  try {
    reemplazar(await actualizarFactura(evento.data.id, { [evento.field]: valor }));
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo guardar la celda',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 4000,
    });
  }
}

/** Informa el resultado de un lote: nunca aborta entero, así que puede haber fallos parciales. */
function informar(resultado: ResultadoLote, accion: string) {
  if (resultado.fallidas.length === 0) {
    toast.add({ severity: 'success', summary: `${resultado.procesadas} facturas ${accion}`, life: 3000 });
    return;
  }
  toast.add({
    severity: 'warn',
    summary: `${resultado.procesadas} de ${resultado.solicitadas} ${accion}`,
    detail: `Fallaron ${resultado.fallidas.length}: ${resultado.fallidas[0]?.motivo ?? ''}`,
    life: 7000,
  });
}

async function marcarVisibles() {
  const ids = visibles.value.filter((f) => !f.revisada).map((f) => f.id);
  if (ids.length === 0) return;
  aplicando.value = true;
  try {
    informar(await revisarLote(ids, true), 'marcadas como revisadas');
    await cargar();
  } finally {
    aplicando.value = false;
  }
}

// ── Aplicar a la selección ───────────────────────────────────────────────────
const masivo = ref({ clasificacion: '', formaPago: '', clienteId: '' });

async function aplicarSeleccion() {
  const ids = seleccion.value.map((f) => f.id);
  if (ids.length === 0) return;
  const cambios: Record<string, string> = {};
  if (masivo.value.clasificacion) cambios[campoClasificacion.value] = masivo.value.clasificacion;
  if (masivo.value.formaPago) cambios.formaPago = masivo.value.formaPago;
  const hayCambios = Object.keys(cambios).length > 0;
  if (!hayCambios && !masivo.value.clienteId) return;

  aplicando.value = true;
  try {
    informar(
      await editarLote(ids, {
        ...(hayCambios ? { cambios } : {}),
        ...(masivo.value.clienteId ? { clienteId: masivo.value.clienteId, formato: periodo.value!.formato } : {}),
      }),
      'actualizadas',
    );
    masivo.value = { clasificacion: '', formaPago: '', clienteId: '' };
    seleccion.value = [];
    await cargar();
  } finally {
    aplicando.value = false;
  }
}

function eliminarSeleccion() {
  const ids = seleccion.value.map((f) => f.id);
  if (ids.length === 0) return;
  confirm.require({
    message: `Se eliminarán ${ids.length} facturas y, cuando sean la única de su documento, también el archivo subido.`,
    header: '¿Eliminar las seleccionadas?',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar',
    rejectLabel: 'Cancelar',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      try {
        informar(await eliminarLote(ids), 'eliminadas');
        seleccion.value = [];
        await cargar();
      } catch (e: any) {
        toast.add({
          severity: 'error',
          summary: 'No se pudieron eliminar',
          detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
          life: 5000,
        });
      }
    },
  });
}

// ── Navegación por teclado ───────────────────────────────────────────────────
// Los atajos que documenta la propia barra de progreso: Enter guarda y salta a
// la siguiente, Alt+←/→ navegan sin guardar.
function irA(nuevo: number) {
  if (nuevo < 0 || nuevo >= visibles.value.length) return;
  indice.value = nuevo;
}

async function onTeclado(ev: KeyboardEvent) {
  const destino = ev.target as HTMLElement | null;
  const enCampo = destino?.tagName === 'INPUT' || destino?.tagName === 'SELECT';
  if (ev.key === 'Enter' && enCampo && facturaActual.value) {
    ev.preventDefault();
    informar(await revisarLote([facturaActual.value.id], true), 'marcadas como revisadas');
    await cargar();
    irA(indice.value + 1);
  } else if (ev.altKey && ev.key === 'ArrowRight') {
    irA(indice.value + 1);
  } else if (ev.altKey && ev.key === 'ArrowLeft') {
    irA(indice.value - 1);
  }
}

function claseFila(f: Factura) {
  if (errores(f) > 0) return 'fila--error';
  if (advertencias(f) > 0) return 'fila--dudosa';
  return '';
}

// Al cambiar de filtro el índice puede quedar fuera de rango.
watch(filtro, () => {
  indice.value = 0;
});

onMounted(async () => {
  await Promise.all([cargar(), catalogos.cargar()]);
  clientes.value = await listarClientes();
  window.addEventListener('keydown', onTeclado);
});
onUnmounted(() => window.removeEventListener('keydown', onTeclado));
</script>

<template>
  <AppLayout v-slot="{ refrescarResumen }">
    <EncabezadoPantalla
      titulo="Revisión en lote"
      :subtitulo="
        periodo
          ? `${periodo.cliente?.nombre ?? 'Cliente'} · ${periodo.formato.replace('F', '')} ${
              periodo.formato === 'F606' ? 'Compras' : 'Ventas'
            } · ${fmtYyyymm(periodo.yyyymm)} · ${facturas.length} facturas`
          : 'Cargando período…'
      "
    />

    <!-- ── Barra de progreso ── -->
    <div class="barra">
      <div class="barra__avance">
        <div class="progreso">
          <div class="progreso__relleno" :style="{ width: `${pct(revisadas, facturas.length)}%` }"></div>
        </div>
        <span class="barra__cifra">
          {{ revisadas }} <span class="barra__de">de {{ facturas.length }} revisadas</span>
        </span>
      </div>
      <span class="barra__separador"></span>
      <div class="indicador"><span class="punto" style="background: var(--error)"></span>Con error<strong>{{ conError.length }}</strong></div>
      <div class="indicador"><span class="punto" style="background: var(--alerta)"></span>Dudosas<strong>{{ dudosas.length }}</strong></div>
      <div class="indicador"><span class="punto" style="background: var(--ok)"></span>Correctas<strong>{{ correctas.length }}</strong></div>
      <div style="flex: 1"></div>
      <div class="atajos">
        <span class="tecla">Enter</span>guardar y siguiente
        <span class="tecla" style="margin-left: 6px">Alt ←→</span>navegar
      </div>
    </div>

    <div class="cuerpo">
      <!-- ── Hoja de lote ── -->
      <section class="panel">
        <div class="panel__cabecera">
          <span class="panel__titulo">Hoja de lote</span>
          <span class="panel__ayuda">Edita en la celda, tabula al siguiente campo.</span>
          <div style="flex: 1"></div>
          <button
            type="button"
            class="chip"
            :class="{ 'chip--activo': filtro === 'error' }"
            @click="filtro = filtro === 'error' ? 'todas' : 'error'"
          >
            Con error <span>{{ conError.length }}</span>
          </button>
          <button
            type="button"
            class="chip"
            :class="{ 'chip--activo': filtro === 'dudosa' }"
            @click="filtro = filtro === 'dudosa' ? 'todas' : 'dudosa'"
          >
            Dudosas <span>{{ dudosas.length }}</span>
          </button>
          <button
            type="button"
            class="chip"
            :class="{ 'chip--activo': filtro === 'todas' }"
            @click="filtro = 'todas'"
          >
            Todas <span>{{ facturas.length }}</span>
          </button>
        </div>

        <DataTable
          v-model:selection="seleccion"
          :value="visibles"
          :loading="cargando"
          data-key="id"
          size="small"
          edit-mode="cell"
          scrollable
          :row-class="claseFila"
          @cell-edit-complete="guardarCelda"
          @row-click="(e: any) => (indice = visibles.findIndex((f) => f.id === e.data.id))"
        >
          <template #empty>No hay facturas en este período todavía.</template>

          <Column selection-mode="multiple" header-style="width: 3rem" />

          <Column header="#" header-style="width: 3.5rem">
            <template #body="{ index, data }: { index: number; data: Factura }">
              <span
                class="contador"
                :class="errores(data) > 0 ? 'contador--error' : advertencias(data) > 0 ? 'contador--dudosa' : ''"
              >
                {{ String(index + 1).padStart(2, '0') }}
              </span>
            </template>
          </Column>

          <Column field="nombreEmisor" header="Comercio">
            <template #body="{ data }: { data: Factura }">
              <span class="comercio">{{ data.nombreEmisor ?? '—' }}</span>
            </template>
          </Column>

          <Column field="ncf" header="NCF">
            <template #body="{ data }: { data: Factura }">
              <span class="ncf">{{ data.ncf || '—' }}</span>
            </template>
          </Column>

          <Column
            :field="campoClasificacion"
            :header="esVenta ? 'Tipo de ingreso' : 'Tipo de bienes y servicios'"
            style="min-width: 220px"
          >
            <template #body="{ data }: { data: Factura }">
              <div class="celda-editable" :class="{ 'celda-editable--vacia': !valorClasificacion(data) }">
                <span>{{ catalogos.descripcion(catalogoClasificacion, valorClasificacion(data)) }}</span>
                <i class="pi pi-chevron-down" style="font-size: 9px; color: #b9bfc9"></i>
              </div>
            </template>
            <template #editor="{ data, field }">
              <Select
                :model-value="(data as any)[field]"
                :options="catalogoClasificacion"
                option-label="descripcion"
                option-value="codigo"
                placeholder="— sin definir —"
                show-clear
                fluid
                @update:model-value="(v) => ((data as any)[field] = v)"
              />
            </template>
          </Column>

          <Column header="ITBIS" style="text-align: right">
            <template #body="{ data }: { data: Factura }">{{ fmtMonto(data.itbisFacturado) }}</template>
          </Column>

          <Column header="Monto RD$" style="text-align: right">
            <template #body="{ data }: { data: Factura }">
              <span class="monto">{{ fmtMonto(data.montoFacturado) }}</span>
            </template>
          </Column>

          <Column header="Estado">
            <template #body="{ data }: { data: Factura }">
              <Pastilla
                v-if="errores(data) > 0"
                :texto="`${errores(data)} error${errores(data) > 1 ? 'es' : ''}`"
                tono="error"
                icono="pi-times"
              />
              <Pastilla v-else-if="data.revisada" texto="Revisada" tono="ok" icono="pi-check" />
              <Pastilla
                v-else-if="advertencias(data) > 0"
                :texto="`${advertencias(data)} aviso${advertencias(data) > 1 ? 's' : ''}`"
                tono="alerta"
                icono="pi-exclamation-triangle"
              />
              <Pastilla v-else texto="Pendiente" tono="neutro" icono="pi-clock" />
            </template>
          </Column>
        </DataTable>

        <div class="panel__pie">
          <span>
            {{ visibles.length }} de {{ facturas.length }} ·
            <strong v-if="conError.length" class="pie__error">{{ conError.length }} con error</strong>
            <span v-else>sin errores</span>
          </span>
          <Button
            label="Marcar visibles como revisadas"
            size="small"
            :loading="aplicando"
            :disabled="visibles.length === 0"
            @click="marcarVisibles().then(refrescarResumen)"
          />
        </div>
      </section>

      <!-- ── Rail derecho ── -->
      <aside class="rail">
        <section class="panel panel--relleno">
          <div class="panel__cabecera">
            <span class="panel__titulo">Vista previa</span>
            <span class="panel__ayuda">{{ facturaActual ? `Fila ${indice + 1}` : '—' }}</span>
          </div>
          <VisorDocumento
            v-if="facturaActual?.documento"
            :documento-id="facturaActual.documento.id"
            :mime-type="facturaActual.documento.mimeType"
            proporcion="4 / 3"
            alto-maximo="300px"
          />
          <p v-else class="vacio">Selecciona una fila para ver su documento.</p>
        </section>

        <section class="panel panel--relleno">
          <span class="panel__titulo">Aplicar a la selección</span>

          <div class="campo">
            <label>{{ esVenta ? 'Tipo de ingreso' : 'Tipo de bienes y servicios' }}</label>
            <Select
              v-model="masivo.clasificacion"
              :options="catalogoClasificacion"
              option-label="descripcion"
              option-value="codigo"
              placeholder="— sin cambiar —"
              show-clear
              fluid
            />
          </div>

          <div v-if="!esVenta" class="campo">
            <label>Forma de pago</label>
            <Select
              v-model="masivo.formaPago"
              :options="catalogos.catalogos.formasPago606"
              option-label="descripcion"
              option-value="codigo"
              placeholder="— sin cambiar —"
              show-clear
              fluid
            />
          </div>

          <div class="campo">
            <label>Cliente</label>
            <Select
              v-model="masivo.clienteId"
              :options="clientes"
              option-label="nombre"
              option-value="id"
              placeholder="— sin cambiar —"
              show-clear
              fluid
            />
          </div>

          <Button
            :label="`Aplicar a ${seleccion.length} seleccionadas`"
            size="small"
            severity="contrast"
            :disabled="seleccion.length === 0"
            :loading="aplicando"
            @click="aplicarSeleccion().then(refrescarResumen)"
          />
          <Button
            :label="`Eliminar ${seleccion.length} seleccionadas`"
            icon="pi pi-trash"
            size="small"
            severity="danger"
            outlined
            :disabled="seleccion.length === 0"
            @click="eliminarSeleccion"
          />
        </section>
      </aside>
    </div>
  </AppLayout>
</template>

<style scoped>
/* ── Barra de progreso ── */
.barra {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.barra__avance {
  display: flex;
  align-items: center;
  gap: 10px;
}
.progreso {
  width: 120px;
  height: 7px;
  border-radius: var(--radio-chip);
  background: #f0f2f4;
  overflow: hidden;
}
.progreso__relleno {
  height: 100%;
  background: var(--teal);
  border-radius: var(--radio-chip);
  transition: width 0.2s;
}
.barra__cifra {
  font-size: 12.5px;
  font-weight: 700;
}
.barra__de {
  color: var(--texto-debil);
  font-weight: 500;
}
.barra__separador {
  width: 1px;
  height: 20px;
  background: #eceef1;
}
.indicador {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--texto-medio);
}
.indicador strong {
  color: var(--texto);
}
.punto {
  width: 7px;
  height: 7px;
  border-radius: var(--radio-chip);
}
.atajos {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--texto-tenue);
}
.tecla {
  border: 1px solid var(--borde);
  border-radius: 5px;
  padding: 2px 6px;
  font-weight: 700;
  color: var(--texto-suave);
}

/* ── Cuerpo ── */
.cuerpo {
  display: grid;
  grid-template-columns: 1fr 330px;
  gap: 14px;
  align-items: start;
}
.panel {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  overflow: hidden;
}
.panel--relleno {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.panel__cabecera {
  padding: 12px 16px;
  border-bottom: 1px solid var(--borde-tenue);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.panel--relleno .panel__cabecera {
  padding: 0;
  border-bottom: 0;
}
.panel__titulo {
  font-size: 13px;
  font-weight: 700;
}
.panel__ayuda {
  font-size: 11.5px;
  color: var(--texto-debil);
}
.panel__pie {
  padding: 11px 16px;
  border-top: 1px solid var(--borde-tenue);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--texto-tenue);
}
.pie__error {
  color: var(--alerta);
}

.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radio-chip);
  padding: 4px 11px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  background: var(--superficie);
  color: var(--texto-suave);
  border: 1px solid var(--borde-fuerte);
  font-family: inherit;
}
.chip span {
  opacity: 0.6;
}
.chip--activo {
  background: var(--teal-suave);
  color: var(--teal);
  border-color: var(--teal-borde);
}

/* ── Tabla ── */
.contador {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  background: #f4f5f7;
  color: var(--texto-suave);
}
.contador--error {
  background: var(--error-fondo);
  color: var(--error);
}
.contador--dudosa {
  background: var(--alerta-fondo);
  color: var(--alerta);
}
.comercio {
  font-weight: 600;
  white-space: nowrap;
}
.ncf {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: var(--texto-medio);
}
.monto {
  font-weight: 700;
}
.celda-editable {
  border: 1px solid var(--borde-fuerte);
  background: var(--superficie);
  border-radius: 7px;
  padding: 5px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--texto);
}
.celda-editable--vacia {
  color: var(--texto-debil);
  font-weight: 500;
  border-style: dashed;
}

:deep(.fila--error) {
  background: #fffbfa;
}
:deep(.fila--dudosa) {
  background: #fffdf7;
}

/* ── Rail ── */
.rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 76px;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.campo label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--texto-suave);
}
.vacio {
  margin: 0;
  font-size: 12px;
  color: var(--texto-debil);
  text-align: center;
  padding: 24px 0;
}

@media (max-width: 1200px) {
  .cuerpo {
    grid-template-columns: 1fr;
  }
  .rail {
    position: static;
  }
}
</style>
