<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import AppLayout from '../components/AppLayout.vue';
import EncabezadoPantalla from '../components/ui/EncabezadoPantalla.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import { listarClientes } from '../api/clientes';
import { buscarPeriodo } from '../api/periodos';
import { listarFacturasPorPeriodo } from '../api/facturas';
import {
  descargarExcel,
  descargarExcelCompleto,
  descargarExcelPorRango,
  descargarExportacionGuardada,
  exportacionesRecientes,
  verificarExportable,
} from '../api/exportacion';
import { fmtFechaHora, fmtMontoCorto } from '../formato';
import type { Cliente, EstadoExportable, ExportacionGlobal, Formato, Periodo } from '../types';

const toast = useToast();
const clientes = ref<Cliente[]>([]);
const recientes = ref<ExportacionGlobal[]>([]);

const FORMATOS: Array<{ label: string; value: Formato }> = [
  { label: '606 · Compras', value: 'F606' },
  { label: '607 · Ventas', value: 'F607' },
];

// ── Declaración mensual ──────────────────────────────────────────────────────
const declaracion = reactive({ clienteId: '', formato: 'F606' as Formato, mes: null as Date | null });
const buscando = ref(false);
const sinResultado = ref(false);
const periodo = ref<Periodo | null>(null);
const estado = ref<EstadoExportable | null>(null);
const totales = reactive({ monto: '0', itbis: '0' });
const descargando = ref<'excel' | null>(null);

const puedeBuscar = computed(() => Boolean(declaracion.clienteId && declaracion.mes));

async function buscar() {
  if (!puedeBuscar.value || !declaracion.mes) return;
  buscando.value = true;
  sinResultado.value = false;
  periodo.value = null;
  estado.value = null;
  try {
    const yyyymm = `${declaracion.mes.getFullYear()}${String(declaracion.mes.getMonth() + 1).padStart(2, '0')}`;
    const encontrado = await buscarPeriodo(declaracion.clienteId, declaracion.formato, yyyymm);
    if (!encontrado) {
      sinResultado.value = true;
      return;
    }
    periodo.value = encontrado;
    // El `_count` del período solo trae el número de facturas: los montos hay
    // que sumarlos de las propias filas.
    const [exportable, facturas] = await Promise.all([
      verificarExportable(encontrado.id),
      listarFacturasPorPeriodo(encontrado.id),
    ]);
    estado.value = exportable;
    totales.monto = String(facturas.reduce((acc, f) => acc + Number(f.montoFacturado || 0), 0));
    totales.itbis = String(facturas.reduce((acc, f) => acc + Number(f.itbisFacturado || 0), 0));
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo buscar el período',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 5000,
    });
  } finally {
    buscando.value = false;
  }
}

// Buscar solo cuando el trío está completo evita disparar peticiones a medio
// llenar el formulario.
watch(() => [declaracion.clienteId, declaracion.formato, declaracion.mes], () => {
  if (puedeBuscar.value) buscar();
  else {
    periodo.value = null;
    estado.value = null;
    sinResultado.value = false;
  }
});

async function bajar() {
  if (!periodo.value) return;
  descargando.value = 'excel';
  try {
    await descargarExcel(periodo.value.id);
    await cargarRecientes();
    toast.add({ severity: 'success', summary: 'Archivo generado', life: 3000 });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo generar',
      detail: e?.response?.data?.message ?? 'Revisa los errores del período.',
      life: 6000,
    });
  } finally {
    descargando.value = null;
  }
}

// ── Excel por rango ──────────────────────────────────────────────────────────
const rango = reactive({
  clienteId: '',
  formato: 'F606' as Formato,
  desde: null as Date | null,
  hasta: null as Date | null,
});
const generandoRango = ref(false);

const opcionesClienteRango = computed(() => [
  { id: '', nombre: 'Todos los clientes' } as Cliente,
  ...clientes.value,
]);

function aIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

async function bajarRango() {
  if (!rango.desde || !rango.hasta) return;
  generandoRango.value = true;
  try {
    // clienteId vacío = "todos": se manda undefined, porque el backend lo
    // valida como UUID y rechazaría la cadena vacía.
    await descargarExcelPorRango(rango.clienteId || undefined, rango.formato, aIso(rango.desde), aIso(rango.hasta));
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo generar el Excel',
      detail: e?.response?.data?.message ?? 'Revisa el rango de fechas.',
      life: 5000,
    });
  } finally {
    generandoRango.value = false;
  }
}

const generandoCompleto = ref(false);

/** Mismo cliente/rango del bloque de arriba — el formato no aplica aquí, sale todo junto. */
async function bajarCompleto() {
  if (!rango.desde || !rango.hasta) return;
  generandoCompleto.value = true;
  try {
    await descargarExcelCompleto(rango.clienteId || undefined, aIso(rango.desde), aIso(rango.hasta));
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo generar el Excel',
      detail: e?.response?.data?.message ?? 'Revisa el rango de fechas.',
      life: 5000,
    });
  } finally {
    generandoCompleto.value = false;
  }
}

// ── Historial ────────────────────────────────────────────────────────────────
async function cargarRecientes() {
  try {
    recientes.value = (await exportacionesRecientes(8)).items;
  } catch {
    recientes.value = [];
  }
}

async function rebajar(e: ExportacionGlobal) {
  const nombre = `${e.periodo.formato.replace('F', '')}_${e.periodo.cliente.rnc}_${e.periodo.yyyymm}.${
    e.tipo === 'TXT' ? 'txt' : 'xlsx'
  }`;
  try {
    await descargarExportacionGuardada(e.id, nombre);
  } catch {
    toast.add({ severity: 'error', summary: 'No se pudo descargar el archivo guardado.', life: 4000 });
  }
}

function nombreArchivo(e: ExportacionGlobal): string {
  return `${e.periodo.formato.replace('F', '')}_${e.periodo.cliente.rnc}_${e.periodo.yyyymm}.${
    e.tipo === 'TXT' ? 'txt' : 'xlsx'
  }`;
}

onMounted(async () => {
  clientes.value = await listarClientes();
  await cargarRecientes();
});
</script>

<template>
  <AppLayout>
    <EncabezadoPantalla
      titulo="Reportería y exportación"
      subtitulo="Genera el TXT oficial de la DGII o un Excel de consulta interna."
    />

    <div class="rejilla">
      <!-- ── Declaración mensual ── -->
      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <div class="icono icono--teal"><i class="pi pi-file-export"></i></div>
          <div class="tarjeta__titulos">
            <span class="tarjeta__titulo">Declaración mensual</span>
            <span class="tarjeta__sub">Formato 606 / 607 · TXT oficial DGII</span>
          </div>
        </div>

        <div class="campos">
          <div class="campo campo--ancho">
            <label for="decl-cliente">Cliente</label>
            <Select
              v-model="declaracion.clienteId"
              input-id="decl-cliente"
              :options="clientes"
              option-label="nombre"
              option-value="id"
              placeholder="Elige un cliente"
              fluid
            />
          </div>
          <div class="campo">
            <label for="decl-formato">Formato</label>
            <Select
              v-model="declaracion.formato"
              input-id="decl-formato"
              :options="FORMATOS"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <div class="campo">
            <label for="decl-mes">Mes</label>
            <DatePicker
              v-model="declaracion.mes"
              input-id="decl-mes"
              view="month"
              date-format="MM yy"
              show-icon
              icon-display="input"
              fluid
            />
          </div>
        </div>

        <p v-if="buscando" class="aviso">Buscando período…</p>
        <p v-else-if="sinResultado" class="aviso aviso--alerta">
          No hay facturas clasificadas para ese cliente, formato y mes todavía.
        </p>

        <div v-else-if="periodo && estado" class="resultado" :class="{ 'resultado--error': !estado.puedeExportar }">
          <div class="resultado__cabecera">
            <span class="resultado__titulo">Período encontrado · {{ estado.totalFacturas }} facturas</span>
            <Pastilla
              :texto="estado.puedeExportar ? 'Listo' : `${estado.errores.length} errores`"
              :tono="estado.puedeExportar ? 'teal' : 'error'"
            />
          </div>

          <div class="metricas">
            <div class="metrica">
              <span class="metrica__label">Registros</span>
              <span class="metrica__valor">{{ estado.totalFacturas }}</span>
            </div>
            <div class="metrica">
              <span class="metrica__label">Monto total</span>
              <span class="metrica__valor">{{ fmtMontoCorto(totales.monto) }}</span>
            </div>
            <div class="metrica">
              <span class="metrica__label">ITBIS</span>
              <span class="metrica__valor">{{ fmtMontoCorto(totales.itbis) }}</span>
            </div>
          </div>

          <!-- Los errores bloquean el TXT: hay que verlos aquí, no solo saber que existen. -->
          <div v-if="!estado.puedeExportar" class="desglose-bloqueo">
            <div v-if="estado.sinConfirmar > 0" class="bloqueo-item">
              <i class="pi pi-exclamation-circle" style="color: var(--alerta);"></i>
              <span>{{ estado.sinConfirmar }} sugerencias sin confirmar.</span>
              <router-link :to="{ name: 'facturas', query: { vista: 'por_confirmar' } }" class="enlace">Ir a Triaje</router-link>
            </div>
            <div v-if="estado.errores.length > 0" class="bloqueo-item">
              <i class="pi pi-times-circle" style="color: var(--error);"></i>
              <span>{{ estado.errores.length }} errores de validación.</span>
              <router-link :to="{ name: 'facturas', query: { clienteId: periodo.clienteId } }" class="enlace">Ir a Facturas</router-link>
            </div>
            <ul v-if="estado.errores.length" class="errores">
              <li v-for="(e, i) in estado.errores.slice(0, 5)" :key="i"><strong>{{ e.codigo }}</strong>: {{ e.mensaje }}</li>
              <li v-if="estado.errores.length > 5" class="errores__resto">
                y {{ estado.errores.length - 5 }} más…
              </li>
            </ul>
          </div>

          <div class="acciones">
            <Button
              label="Ir a Facturas"
              outlined
              size="small"
              @click="$router.push({ name: 'facturas', query: { clienteId: periodo.clienteId } })"
            />
            <Button
              label="Descargar Excel 606/607"
              size="small"
              :disabled="!estado.puedeExportar"
              :loading="descargando === 'excel'"
              @click="bajar()"
            />
          </div>
        </div>
      </section>

      <div class="columna">
        <!-- ── Excel por rango ── -->
        <section class="tarjeta">
          <div class="tarjeta__cabecera">
            <div class="icono icono--azul"><i class="pi pi-table"></i></div>
            <div class="tarjeta__titulos">
              <span class="tarjeta__titulo">Excel por rango</span>
              <span class="tarjeta__sub">Consulta interna, puede abarcar varios meses</span>
            </div>
          </div>

          <div class="campos">
            <div class="campo campo--ancho">
              <label for="rango-cliente">Cliente</label>
              <Select
                v-model="rango.clienteId"
                input-id="rango-cliente"
                :options="opcionesClienteRango"
                option-label="nombre"
                option-value="id"
                fluid
              />
            </div>
            <div class="campo campo--ancho">
              <label for="rango-formato">Formato</label>
              <Select
                v-model="rango.formato"
                input-id="rango-formato"
                :options="FORMATOS"
                option-label="label"
                option-value="value"
                fluid
              />
            </div>
            <div class="campo">
              <label for="rango-desde">Desde</label>
              <DatePicker v-model="rango.desde" input-id="rango-desde" date-format="dd/mm/yy" show-icon icon-display="input" fluid />
            </div>
            <div class="campo">
              <label for="rango-hasta">Hasta</label>
              <DatePicker v-model="rango.hasta" input-id="rango-hasta" date-format="dd/mm/yy" show-icon icon-display="input" fluid />
            </div>
          </div>

          <div class="tarjeta__botones">
            <Button
              label="Descargar Excel 606/607"
              outlined
              size="small"
              :disabled="!rango.desde || !rango.hasta"
              :loading="generandoRango"
              @click="bajarRango"
            />
            <Button
              label="Descargar todo (Excel)"
              outlined
              size="small"
              :disabled="!rango.desde || !rango.hasta"
              :loading="generandoCompleto"
              @click="bajarCompleto"
            />
          </div>
          <p class="ayuda-completo">
            "Descargar todo" trae cada factura del rango con todos los campos extraídos, esté o no clasificada — sirve
            para auditar lo que leyó la IA, no reemplaza el 606/607 de la DGII.
          </p>
        </section>

        <!-- ── Exportaciones recientes ── -->
        <section class="tarjeta">
          <span class="tarjeta__titulo">Exportaciones recientes</span>
          <p v-if="recientes.length === 0" class="aviso">Todavía no se ha exportado ningún período.</p>
          <div v-for="e in recientes" :key="e.id" class="exportacion">
            <div class="icono" :class="e.tipo === 'EXCEL' ? 'icono--verde' : 'icono--teal'">
              <i class="pi" :class="e.tipo === 'EXCEL' ? 'pi-file-excel' : 'pi-file'"></i>
            </div>
            <div class="exportacion__texto">
              <span class="exportacion__nombre">{{ nombreArchivo(e) }}</span>
              <span class="exportacion__detalle">
                {{ e.periodo.cliente.nombre }} · {{ e.cantidadRegistros }} registros · {{ fmtFechaHora(e.createdAt) }}
              </span>
            </div>
            <i class="pi pi-download exportacion__bajar" title="Descargar de nuevo" @click="rebajar(e)"></i>
          </div>
        </section>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.rejilla {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
  align-items: start;
}
.columna {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tarjeta {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.tarjeta__cabecera {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tarjeta__titulos {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.tarjeta__titulo {
  font-size: 14px;
  font-weight: 600;
}
.tarjeta__sub {
  font-size: 11.5px;
  color: var(--texto-tenue);
}
.tarjeta__botones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ayuda-completo {
  margin: 0;
  font-size: 11px;
  color: var(--texto-tenue);
  line-height: 1.4;
}
.icono {
  width: 30px;
  height: 30px;
  border-radius: var(--radio-control);
  display: grid;
  place-items: center;
  flex: none;
  font-size: 13px;
}
.icono--teal {
  background: var(--teal-suave);
  color: var(--teal);
}
.icono--azul {
  background: var(--info-fondo);
  color: var(--info);
}
.icono--verde {
  background: var(--ok-fondo);
  color: var(--ok);
}

.campos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.campo--ancho {
  grid-column: span 2;
}
.campo label {
  font-size: 11px;
  font-weight: 600;
  color: var(--texto-suave);
}

.aviso {
  margin: 0;
  font-size: 12.5px;
  color: var(--texto-tenue);
}
.aviso--alerta {
  color: var(--alerta);
  background: var(--alerta-fondo);
  border: 1px solid var(--alerta-borde);
  border-radius: var(--radio-control);
  padding: 9px 11px;
}

.resultado {
  border: 1px solid #d7f5ee;
  background: var(--teal-suave);
  border-radius: 11px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.resultado--error {
  border-color: var(--error-borde);
  background: var(--error-fondo);
}
.resultado__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.resultado__titulo {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--teal);
}
.resultado--error .resultado__titulo {
  color: var(--error);
}
.metricas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.metrica {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metrica__label {
  font-size: 10.5px;
  color: #5f8f89;
  font-weight: 600;
}
.resultado--error .metrica__label {
  color: var(--texto-suave);
}
.metrica__valor {
  font-size: 16px;
  font-weight: 600;
  color: #134e4a;
}
.resultado--error .metrica__valor {
  color: var(--texto);
}
.errores {
  margin: 4px 0 0 0;
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11.5px;
  color: var(--error);
}
.errores__resto {
  list-style: none;
  margin-left: -24px;
  color: var(--texto-suave);
}
.desglose-bloqueo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.bloqueo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.enlace {
  color: var(--teal);
  text-decoration: underline;
  font-weight: 600;
  cursor: pointer;
}
.enlace:hover {
  color: var(--teal-oscuro);
}
.acciones {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.exportacion {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 0;
  border-bottom: 1px solid #f4f5f7;
}
.exportacion:last-child {
  border-bottom: 0;
}
.exportacion__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}
.exportacion__nombre {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.exportacion__detalle {
  font-size: 10.5px;
  color: var(--texto-debil);
}
.exportacion__bajar {
  font-size: 12px;
  color: var(--texto-debil);
  cursor: pointer;
}
.exportacion__bajar:hover {
  color: var(--teal);
}

@media (max-width: 1100px) {
  .rejilla {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .campos {
    grid-template-columns: 1fr;
  }
  .metricas {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .tarjeta { padding: 16px; gap: 12px; }
  .icono { width: 26px; height: 26px; font-size: 12px; }
  .resultado { padding: 12px; }
}

@media (max-width: 480px) {
  .tarjeta { padding: 14px; gap: 10px; }
  .tarjeta__titulo { font-size: 13px; }
  .icono { width: 24px; height: 24px; font-size: 11px; border-radius: 7px; }
  .campo { font-size: 12px; }
  .campo label { font-size: 11px; }
  .resultado { padding: 10px; gap: 9px; }
  .resultado__titulo { font-size: 12px; }
  .metrica__label { font-size: 10px; }
  .metrica__valor { font-size: 12px; }
  .exportacion { padding: 7px 0; gap: 8px; }
  .exportacion__nombre { font-size: 12px; }
  .exportacion__detalle { font-size: 10.5px; }
  .exportacion__bajar { font-size: 11px; }
}
</style>
