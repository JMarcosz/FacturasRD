<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import Drawer from 'primevue/drawer';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import AppLayout from '../components/AppLayout.vue';
import VisorDocumento from '../components/VisorDocumento.vue';
import PanelDiagnostico from '../components/PanelDiagnostico.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import TarjetaPanel from '../components/ui/TarjetaPanel.vue';
import {
  actualizarFactura,
  clasificarFactura,
  eliminarFactura,
  marcarRevisada as apiMarcarRevisada,
  obtenerFactura,
} from '../api/facturas';
import { listarClientes } from '../api/clientes';
import { useCatalogosStore } from '../stores/catalogos';
import { fmtFechaCorta, fmtMonto } from '../formato';
import type { Cliente, Factura, Formato } from '../types';

const props = defineProps<{ facturaId: string }>();

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const catalogos = useCatalogosStore();

const factura = ref<Factura | null>(null);
const clientes = ref<Cliente[]>([]);
const cargando = ref(true);
const guardando = ref(false);
const verOcr = ref(false);
const visorRef = ref<InstanceType<typeof VisorDocumento> | null>(null);

// El formato lo trae la propia factura una vez clasificada; mientras no lo
// esté, se muestra el bloque de clasificación en vez de los campos de 606/607.
const formato = computed<Formato | null>(() => factura.value?.formato ?? null);

const FORMATOS: Array<{ label: string; value: Formato }> = [
  { label: '607 · Venta', value: 'F607' },
  { label: '606 · Compra', value: 'F606' },
];

const clasificacion = reactive({ clienteId: '', formato: 'F607' as Formato });
const clasificando = ref(false);

const form = reactive({
  rncCedula: '',
  tipoIdentificacion: '1',
  nombreEmisor: '',
  identificacionEmisor: '',
  nombreReceptor: '',
  identificacionReceptor: '',
  ncf: '',
  ncfModificado: '',
  fechaComprobante: null as Date | null,
  fechaRetencionOPago: null as Date | null,
  tipoIngreso: '',
  tipoBienesServicios: '',
  formaPago: '',
  montoFacturado: 0,
  itbisFacturado: 0,
  itbisRetenido: 0,
  itbisPercibido: 0,
  retencionRenta: 0,
  isrPercibido: 0,
  isc: 0,
  otrosImpuestos: 0,
  propinaLegal: 0,
  montoServicios: 0,
  montoBienes: 0,
  montoEfectivo: 0,
  montoChequeTransferencia: 0,
  montoTarjeta: 0,
  montoVentaCredito: 0,
  montoBonos: 0,
  montoPermuta: 0,
  montoOtrasFormas: 0,
});

function aFecha(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

function cargarDesdeFactura(f: Factura) {
  form.rncCedula = f.rncCedula;
  form.tipoIdentificacion = f.tipoIdentificacion;
  form.nombreEmisor = f.nombreEmisor ?? '';
  form.identificacionEmisor = f.identificacionEmisor ?? '';
  form.nombreReceptor = f.nombreReceptor ?? '';
  form.identificacionReceptor = f.identificacionReceptor ?? '';
  form.ncf = f.ncf;
  form.ncfModificado = f.ncfModificado ?? '';
  form.fechaComprobante = aFecha(f.fechaComprobante);
  form.fechaRetencionOPago = aFecha(f.fechaRetencionOPago);
  form.tipoIngreso = f.tipoIngreso ?? '';
  form.tipoBienesServicios = f.tipoBienesServicios ?? '';
  form.formaPago = f.formaPago ?? '';
  form.montoFacturado = Number(f.montoFacturado);
  form.itbisFacturado = Number(f.itbisFacturado);
  form.itbisRetenido = Number(f.itbisRetenido);
  form.itbisPercibido = Number(f.itbisPercibido);
  form.retencionRenta = Number(f.retencionRenta);
  form.isrPercibido = Number(f.isrPercibido);
  form.isc = Number(f.isc);
  form.otrosImpuestos = Number(f.otrosImpuestos);
  form.propinaLegal = Number(f.propinaLegal);
  form.montoServicios = Number(f.montoServicios ?? 0);
  form.montoBienes = Number(f.montoBienes ?? 0);
  form.montoEfectivo = Number(f.montoEfectivo ?? 0);
  form.montoChequeTransferencia = Number(f.montoChequeTransferencia ?? 0);
  form.montoTarjeta = Number(f.montoTarjeta ?? 0);
  form.montoVentaCredito = Number(f.montoVentaCredito ?? 0);
  form.montoBonos = Number(f.montoBonos ?? 0);
  form.montoPermuta = Number(f.montoPermuta ?? 0);
  form.montoOtrasFormas = Number(f.montoOtrasFormas ?? 0);
}

async function cargar() {
  cargando.value = true;
  try {
    factura.value = await obtenerFactura(props.facturaId);
    cargarDesdeFactura(factura.value);
  } finally {
    cargando.value = false;
  }
}

/**
 * El backend ya entrega `confidences` con los nombres de columna de la factura
 * (los traduce desde los del extractor al leer), así que aquí se indexa
 * directamente por el nombre del campo.
 */
function confianza(campo: string): number | null {
  return factura.value?.confidences?.[campo] ?? null;
}

function tonoConfianza(campo: string): 'ok' | 'alerta' | 'error' | 'indigo' {
  const c = confianza(campo);
  if (c === null) return 'indigo';
  if (c >= 0.9) return 'ok';
  if (c >= 0.8) return 'alerta';
  return 'error';
}

function textoConfianza(campo: string): string {
  const c = confianza(campo);
  // Sin confianza registrada, el valor lo puso una persona.
  if (c === null) return 'Manual';
  return `${Math.round(c * 100)}%`;
}

/** Los campos con confianza dudosa se resaltan para que se confirmen a mano. */
function dudoso(campo: string): boolean {
  const c = confianza(campo);
  return c !== null && c < 0.9;
}

const erroresPorCampo = computed(() => {
  const mapa: Record<string, string[]> = {};
  for (const v of factura.value?.validaciones ?? []) {
    if (!v.campo) continue;
    (mapa[v.campo] ??= []).push(v.mensaje);
  }
  return mapa;
});

const tasaItbisPct = computed(() => {
  const cliente = clientes.value.find((c) => c.id === factura.value?.cliente?.id);
  return cliente ? Math.round(Number(cliente.tasaItbis) * 100) : null;
});

function normalizarIdentificacion(id: string | null | undefined): string {
  if (!id) return '';
  return id.replace(/[^\d]/g, '');
}

const mismatchRnc = computed(() => {
  if (!factura.value || !factura.value.cliente) return false;
  const clienteRnc = normalizarIdentificacion(factura.value.cliente.rnc);
  const emisorId = normalizarIdentificacion(factura.value.identificacionEmisor);
  const receptorId = normalizarIdentificacion(factura.value.identificacionReceptor);
  if (!clienteRnc) return false;
  return clienteRnc !== emisorId && clienteRnc !== receptorId;
});

const totales = computed(() => {
  const f = factura.value;
  if (!f) return [];
  const total =
    Number(f.montoFacturado) +
    Number(f.itbisFacturado) +
    Number(f.isc) +
    Number(f.otrosImpuestos) +
    Number(f.propinaLegal);
  return [
    { label: 'Monto facturado', valor: fmtMonto(f.montoFacturado), fuerte: false },
    {
      label: `ITBIS facturado${tasaItbisPct.value !== null ? ` (${tasaItbisPct.value}%)` : ''}`,
      valor: fmtMonto(f.itbisFacturado),
      fuerte: false,
    },
    { label: 'ITBIS retenido', valor: fmtMonto(f.itbisRetenido), fuerte: false },
    { label: 'Propina legal', valor: fmtMonto(f.propinaLegal), fuerte: false },
    { label: 'Total', valor: fmtMonto(String(total)), fuerte: true },
  ];
});

/** "· 1 de N" del pie del visor — N sale de Documento.paginas; sin navegación multipágina todavía. */
const paginacion = computed(() => {
  const paginas = factura.value?.documento?.paginas ?? 1;
  return `1 de ${paginas}`;
});

const subtitulo = computed(() => {
  const f = factura.value;
  if (!f) return '';
  const partes = [
    f.ncf ? `NCF ${f.ncf}` : null,
    f.identificacionEmisor ? `RNC ${f.identificacionEmisor}` : null,
    fmtFechaCorta(f.fechaComprobante),
    f.cliente ? `Cliente: ${f.cliente.nombre}` : null,
  ];
  return partes.filter(Boolean).join(' · ');
});

function tipoIdentificacionPorLongitud(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length === 9) return '1';
  if (digitos.length === 11) return '2';
  return '3';
}

/** Copia un RNC de cualquiera de los dos lados al campo que se declara ante la DGII. */
function usarIdentificacion(valor: string) {
  if (!valor) return;
  form.rncCedula = valor.replace(/[^\d-]/g, '');
  form.tipoIdentificacion = tipoIdentificacionPorLongitud(valor);
}

function aIso(fecha: Date | null): string | null {
  return fecha ? fecha.toISOString().slice(0, 10) : null;
}

async function guardar(): Promise<Factura | null> {
  if (!factura.value) return null;
  guardando.value = true;
  try {
    const payload: Record<string, unknown> = {
      rncCedula: form.rncCedula,
      tipoIdentificacion: form.tipoIdentificacion,
      nombreEmisor: form.nombreEmisor || null,
      identificacionEmisor: form.identificacionEmisor || null,
      nombreReceptor: form.nombreReceptor || null,
      identificacionReceptor: form.identificacionReceptor || null,
      ncf: form.ncf,
      ncfModificado: form.ncfModificado || null,
      fechaComprobante: aIso(form.fechaComprobante) ?? undefined,
      fechaRetencionOPago: aIso(form.fechaRetencionOPago),
      montoFacturado: form.montoFacturado,
      itbisFacturado: form.itbisFacturado,
      itbisRetenido: form.itbisRetenido,
      itbisPercibido: form.itbisPercibido,
      retencionRenta: form.retencionRenta,
      isrPercibido: form.isrPercibido,
      isc: form.isc,
      otrosImpuestos: form.otrosImpuestos,
      propinaLegal: form.propinaLegal,
    };
    if (formato.value === 'F607') {
      Object.assign(payload, {
        tipoIngreso: form.tipoIngreso || null,
        montoEfectivo: form.montoEfectivo,
        montoChequeTransferencia: form.montoChequeTransferencia,
        montoTarjeta: form.montoTarjeta,
        montoVentaCredito: form.montoVentaCredito,
        montoBonos: form.montoBonos,
        montoPermuta: form.montoPermuta,
        montoOtrasFormas: form.montoOtrasFormas,
      });
    } else if (formato.value === 'F606') {
      Object.assign(payload, {
        tipoBienesServicios: form.tipoBienesServicios || null,
        formaPago: form.formaPago || null,
        montoServicios: form.montoServicios,
        montoBienes: form.montoBienes,
      });
    }
    const actualizada = await actualizarFactura(factura.value.id, payload);
    factura.value = actualizada;
    cargarDesdeFactura(actualizada);
    return actualizada;
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo guardar',
      detail: e?.response?.data?.message ?? 'Revisa los campos marcados.',
      life: 5000,
    });
    return null;
  } finally {
    guardando.value = false;
  }
}

async function guardarYMarcarRevisada() {
  const guardada = await guardar();
  if (!guardada) return;
  factura.value = await apiMarcarRevisada(guardada.id, true);
  toast.add({ severity: 'success', summary: 'Factura revisada', life: 2500 });
}

async function clasificar() {
  if (!clasificacion.clienteId || !factura.value) return;
  clasificando.value = true;
  try {
    factura.value = await clasificarFactura(factura.value.id, clasificacion.clienteId, clasificacion.formato);
    cargarDesdeFactura(factura.value);
    toast.add({ severity: 'success', summary: 'Factura clasificada', life: 2500 });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo clasificar',
      detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
      life: 5000,
    });
  } finally {
    clasificando.value = false;
  }
}

function descartar() {
  confirm.require({
    message: 'Se eliminará la factura y, si era la única del documento, también el archivo subido.',
    header: '¿Descartar esta factura?',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Descartar',
    rejectLabel: 'Cancelar',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      if (!factura.value) return;
      try {
        await eliminarFactura(factura.value.id);
        toast.add({ severity: 'success', summary: 'Factura descartada', life: 2500 });
        router.push({ name: 'facturas' });
      } catch (e: any) {
        toast.add({
          severity: 'error',
          summary: 'No se pudo descartar',
          detail: e?.response?.data?.message ?? 'Intenta de nuevo.',
          life: 5000,
        });
      }
    },
  });
}

function onTeclado(ev: KeyboardEvent) {
  const destino = ev.target as HTMLElement | null;
  const enCampo = destino?.tagName === 'INPUT' || destino?.tagName === 'SELECT';
  if (ev.key === 'Enter' && enCampo) {
    ev.preventDefault();
    guardarYMarcarRevisada();
  }
}

watch(() => props.facturaId, cargar);

onMounted(async () => {
  await Promise.all([cargar(), catalogos.cargar()]);
  clientes.value = await listarClientes();
  window.addEventListener('keydown', onTeclado);
});
onUnmounted(() => window.removeEventListener('keydown', onTeclado));
</script>

<template>
  <AppLayout v-slot="{ refrescarResumen }">
    <p v-if="cargando" class="estado">Cargando…</p>
    <p v-else-if="!factura" class="estado">Factura no encontrada.</p>

    <template v-else>
      <!-- ── Cabecera ── -->
      <div class="cabecera">
        <div class="cabecera__izq">
          <button type="button" class="volver" @click="$router.push({ name: 'facturas' })">
            <i class="pi pi-arrow-left" style="font-size: 10px"></i>Volver a facturas
          </button>
          <div class="cabecera__titulo">
            <h1>{{ factura.nombreEmisor ?? 'Factura sin emisor' }}</h1>
            <Pastilla
              v-if="factura.formato"
              :texto="factura.formato === 'F607' ? 'INGRESO · 607' : 'GASTO · 606'"
              :tono="factura.formato === 'F607' ? 'ok' : 'neutro'"
            />
            <Pastilla v-else texto="Sin clasificar" tono="alerta" />
            <Pastilla
              :texto="factura.origen === 'IA' ? 'Extraída por IA' : factura.origen === 'EDITADA' ? 'Editada a mano' : 'Manual'"
              tono="indigo"
            />
            <Pastilla v-if="factura.revisada" texto="Revisada" tono="ok" icono="pi-check" />
          </div>
          <span class="cabecera__sub">{{ subtitulo }}</span>
        </div>
        <div class="cabecera__acciones">
          <Button label="Descartar" outlined severity="secondary" size="small" @click="descartar" />
          <Button
            label="Guardar y marcar revisada"
            size="small"
            :loading="guardando"
            @click="guardarYMarcarRevisada().then(refrescarResumen)"
          />
        </div>
      </div>

      <div class="cuerpo">
        <!-- ── Documento original ── -->
        <section class="panel">
          <div class="panel__cabecera">
            <span class="panel__titulo">Documento original</span>
            <div class="herramientas">
              <button type="button" class="herramienta" title="Alejar" @click="visorRef?.alejar()">
                <i class="pi pi-search-minus"></i>
              </button>
              <button type="button" class="herramienta" title="Acercar" @click="visorRef?.acercar()">
                <i class="pi pi-search-plus"></i>
              </button>
              <button type="button" class="herramienta" title="Rotar" @click="visorRef?.rotar()">
                <i class="pi pi-refresh"></i>
              </button>
              <button type="button" class="herramienta" title="Abrir en otra pestaña" @click="visorRef?.abrirAparte()">
                <i class="pi pi-external-link"></i>
              </button>
            </div>
          </div>
          <VisorDocumento
            v-if="factura.documento"
            ref="visorRef"
            :documento-id="factura.documento.id"
            :mime-type="factura.documento.mimeType"
          />
          <div class="panel__pie">
            <span>{{ factura.documento?.filename ?? '—' }} · {{ paginacion }}</span>
            <button type="button" class="enlace" @click="verOcr = true">Ver texto OCR</button>
          </div>
        </section>

        <!-- ── Campos ── -->
        <div class="derecha">
          <section class="panel panel--sin-padding">
            <!-- Sin cliente ni formato no hay 606/607 que rellenar: primero se clasifica. -->
            <div v-if="!factura.clienteId" class="clasificar">
              <p><strong>Sin clasificar.</strong> Elige a qué cliente y en qué formato pertenece esta factura.</p>
              <div class="clasificar__campos">
                <Select
                  v-model="clasificacion.clienteId"
                  :options="clientes"
                  option-label="nombre"
                  option-value="id"
                  placeholder="Elige un cliente"
                  class="clasificar__cliente"
                />
                <Select
                  v-model="clasificacion.formato"
                  :options="FORMATOS"
                  option-label="label"
                  option-value="value"
                />
                <Button
                  label="Clasificar"
                  size="small"
                  :disabled="!clasificacion.clienteId"
                  :loading="clasificando"
                  @click="clasificar().then(refrescarResumen)"
                />
              </div>
            </div>

            <Tabs value="generales">
              <TabList>
                <Tab value="generales">Generales</Tab>
                <Tab value="montos">Montos e impuestos</Tab>
                <Tab value="lineas">Líneas ({{ factura.lineas?.length ?? 0 }})</Tab>
              </TabList>

              <TabPanels>
                <!-- ── Generales ── -->
                <TabPanel value="generales">
                  <div class="campos">
                    <div v-if="mismatchRnc" class="alerta-rnc">
                      <i class="pi pi-exclamation-triangle"></i>
                      <span>Aviso: El RNC del cliente asignado ({{ factura?.cliente?.rnc }}) no coincide con el emisor ni con el receptor del documento.</span>
                    </div>

                    <!-- Los RNC de emisor y receptor viven en sus campos editables de
                         abajo. Repetirlos aquí como badges de solo lectura mostraba el
                         mismo dato dos veces y hacía dudar de cuál era el que cuenta. -->
                    <div class="campo">
                      <div class="campo__cabecera">
                        <label>RNC / Cédula declarado</label>
                        <Pastilla :texto="textoConfianza('rncCedula')" :tono="tonoConfianza('rncCedula')" tamano="sm" />
                      </div>
                      <InputText v-model="form.rncCedula" :invalid="!!erroresPorCampo.rncCedula" fluid />
                      <span v-if="erroresPorCampo.rncCedula" class="nota nota--error">
                        {{ erroresPorCampo.rncCedula[0] }}
                      </span>
                      <span v-else-if="formato" class="nota">
                        {{
                          formato === 'F607'
                            ? 'En un 607 esta columna es del comprador.'
                            : 'En un 606 esta columna es del proveedor.'
                        }}
                      </span>
                    </div>

                    <div class="campo">
                      <div class="campo__cabecera"><label>Tipo de identificación</label></div>
                      <Select
                        v-model="form.tipoIdentificacion"
                        :options="catalogos.catalogos.tiposIdentificacion"
                        option-label="descripcion"
                        option-value="codigo"
                        fluid
                      />
                    </div>

                    <!-- Ambos lados se prellenan con lo que detectó la IA (que puede
                         equivocarse) pero son editables y se guardan, aunque solo uno
                         vaya a la columna que exporta la DGII. -->
                    <div class="campo">
                      <div class="campo__cabecera">
                        <label>Emisor (comercio)</label>
                        <Pastilla :texto="textoConfianza('nombreEmisor')" :tono="tonoConfianza('nombreEmisor')" tamano="sm" />
                      </div>
                      <InputText v-model="form.nombreEmisor" placeholder="Nombre del comercio" fluid />
                      <div class="campo__fila">
                        <InputText v-model="form.identificacionEmisor" placeholder="RNC / Cédula" fluid />
                        <Button
                          label="Usar →"
                          text
                          size="small"
                          :disabled="!form.identificacionEmisor"
                          @click="usarIdentificacion(form.identificacionEmisor)"
                        />
                      </div>
                    </div>

                    <div class="campo">
                      <div class="campo__cabecera">
                        <label>Receptor (cliente)</label>
                        <Pastilla :texto="textoConfianza('nombreReceptor')" :tono="tonoConfianza('nombreReceptor')" tamano="sm" />
                      </div>
                      <InputText v-model="form.nombreReceptor" placeholder="Nombre del cliente" fluid />
                      <div class="campo__fila">
                        <InputText v-model="form.identificacionReceptor" placeholder="RNC / Cédula" fluid />
                        <Button
                          label="Usar →"
                          text
                          size="small"
                          :disabled="!form.identificacionReceptor"
                          @click="usarIdentificacion(form.identificacionReceptor)"
                        />
                      </div>
                    </div>

                    <div class="campo" :class="{ 'campo--dudoso': dudoso('ncf') }">
                      <div class="campo__cabecera">
                        <label>NCF</label>
                        <Pastilla :texto="textoConfianza('ncf')" :tono="tonoConfianza('ncf')" tamano="sm" />
                      </div>
                      <InputText v-model="form.ncf" :invalid="!!erroresPorCampo.ncf" fluid />
                      <span v-if="erroresPorCampo.ncf" class="nota nota--error">{{ erroresPorCampo.ncf[0] }}</span>
                      <span v-else-if="dudoso('ncf')" class="nota nota--alerta">
                        Confianza baja — confirma contra el comprobante
                      </span>
                    </div>

                    <div class="campo">
                      <div class="campo__cabecera"><label>Tipo de NCF</label></div>
                      <InputText :model-value="factura.tipoNcf?.descripcion ?? '—'" readonly fluid />
                      <span class="nota">Se deduce del propio NCF.</span>
                    </div>

                    <div class="campo">
                      <div class="campo__cabecera"><label>NCF modificado</label></div>
                      <InputText v-model="form.ncfModificado" :invalid="!!erroresPorCampo.ncfModificado" fluid />
                      <span v-if="erroresPorCampo.ncfModificado" class="nota nota--error">
                        {{ erroresPorCampo.ncfModificado[0] }}
                      </span>
                    </div>

                    <div class="campo" :class="{ 'campo--dudoso': dudoso('fechaComprobante') }">
                      <div class="campo__cabecera">
                        <label>Fecha del comprobante</label>
                        <Pastilla
                          :texto="textoConfianza('fechaComprobante')"
                          :tono="tonoConfianza('fechaComprobante')"
                          tamano="sm"
                        />
                      </div>
                      <DatePicker
                        v-model="form.fechaComprobante"
                        date-format="dd/mm/yy"
                        show-icon
                        icon-display="input"
                        :invalid="!!erroresPorCampo.fechaComprobante"
                        fluid
                      />
                      <span v-if="erroresPorCampo.fechaComprobante" class="nota nota--error">
                        {{ erroresPorCampo.fechaComprobante[0] }}
                      </span>
                      <span v-else-if="dudoso('fechaComprobante')" class="nota nota--alerta">
                        Confianza baja — confirma contra el comprobante
                      </span>
                    </div>

                    <div class="campo">
                      <div class="campo__cabecera">
                        <label>{{ formato === 'F606' ? 'Fecha de pago' : 'Fecha de retención' }}</label>
                      </div>
                      <DatePicker
                        v-model="form.fechaRetencionOPago"
                        date-format="dd/mm/yy"
                        show-icon
                        icon-display="input"
                        fluid
                      />
                    </div>

                    <div v-if="formato === 'F607'" class="campo campo--ancho">
                      <div class="campo__cabecera"><label>Tipo de ingreso</label></div>
                      <Select
                        v-model="form.tipoIngreso"
                        :options="catalogos.catalogos.tiposIngreso607"
                        option-label="descripcion"
                        option-value="codigo"
                        placeholder="— sin definir —"
                        show-clear
                        :invalid="!!erroresPorCampo.tipoIngreso"
                        fluid
                      />
                      <span v-if="erroresPorCampo.tipoIngreso" class="nota nota--error">
                        {{ erroresPorCampo.tipoIngreso[0] }}
                      </span>
                    </div>

                    <template v-else-if="formato === 'F606'">
                      <div class="campo campo--ancho" :class="{ 'campo--dudoso': dudoso('tipoBienesServicios') }">
                        <div class="campo__cabecera">
                          <label>Tipo de bienes y servicios (606)</label>
                          <Pastilla
                            :texto="textoConfianza('tipoBienesServicios')"
                            :tono="tonoConfianza('tipoBienesServicios')"
                            tamano="sm"
                          />
                        </div>
                        <Select
                          v-model="form.tipoBienesServicios"
                          :options="catalogos.catalogos.tiposBienesServicios606"
                          option-label="descripcion"
                          option-value="codigo"
                          placeholder="— sin definir —"
                          show-clear
                          :invalid="!!erroresPorCampo.tipoBienesServicios"
                          fluid
                        />
                        <span v-if="erroresPorCampo.tipoBienesServicios" class="nota nota--error">
                          {{ erroresPorCampo.tipoBienesServicios[0] }}
                        </span>
                      </div>

                      <div class="campo campo--ancho" :class="{ 'campo--dudoso': dudoso('formaPago') }">
                        <div class="campo__cabecera">
                          <label>Forma de pago</label>
                          <Pastilla :texto="textoConfianza('formaPago')" :tono="tonoConfianza('formaPago')" tamano="sm" />
                        </div>
                        <Select
                          v-model="form.formaPago"
                          :options="catalogos.catalogos.formasPago606"
                          option-label="descripcion"
                          option-value="codigo"
                          placeholder="— sin definir —"
                          show-clear
                          :invalid="!!erroresPorCampo.formaPago"
                          fluid
                        />
                        <span v-if="erroresPorCampo.formaPago" class="nota nota--error">
                          {{ erroresPorCampo.formaPago[0] }}
                        </span>
                        <span v-else-if="dudoso('formaPago')" class="nota nota--alerta">
                          Confianza baja — confirma contra el comprobante
                        </span>
                      </div>
                    </template>

                    <div v-if="factura.cliente" class="campo campo--ancho">
                      <div class="campo__cabecera">
                        <label>Cliente al que se imputa</label>
                        <Pastilla texto="Manual" tono="indigo" tamano="sm" />
                      </div>
                      <InputText :model-value="factura.cliente.nombre" readonly fluid />
                    </div>
                  </div>
                </TabPanel>

                <!-- ── Montos e impuestos ── -->
                <TabPanel value="montos">
                  <div class="campos">
                    <div class="campo" :class="{ 'campo--dudoso': dudoso('montoFacturado') }">
                      <div class="campo__cabecera">
                        <label>Monto facturado</label>
                        <Pastilla :texto="textoConfianza('montoFacturado')" :tono="tonoConfianza('montoFacturado')" tamano="sm" />
                      </div>
                      <InputNumber v-model="form.montoFacturado" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>
                    <div class="campo" :class="{ 'campo--dudoso': dudoso('itbisFacturado') }">
                      <div class="campo__cabecera">
                        <label>ITBIS facturado</label>
                        <Pastilla :texto="textoConfianza('itbisFacturado')" :tono="tonoConfianza('itbisFacturado')" tamano="sm" />
                      </div>
                      <InputNumber
                        v-model="form.itbisFacturado"
                        mode="currency"
                        currency="DOP"
                        locale="es-DO"
                        :invalid="!!erroresPorCampo.itbisFacturado"
                        fluid
                      />
                      <span v-if="erroresPorCampo.itbisFacturado" class="nota nota--alerta">
                        {{ erroresPorCampo.itbisFacturado[0] }}
                      </span>
                    </div>

                    <div class="campo">
                      <div class="campo__cabecera"><label>ISC</label></div>
                      <InputNumber v-model="form.isc" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>
                    <div class="campo">
                      <div class="campo__cabecera"><label>Otros impuestos</label></div>
                      <InputNumber v-model="form.otrosImpuestos" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>
                    <div class="campo">
                      <div class="campo__cabecera"><label>Propina legal</label></div>
                      <InputNumber v-model="form.propinaLegal" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>
                    <div class="campo">
                      <div class="campo__cabecera">
                        <label>{{ formato === 'F606' ? 'ITBIS retenido' : 'ITBIS retenido por terceros' }}</label>
                      </div>
                      <InputNumber v-model="form.itbisRetenido" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>
                    <div class="campo">
                      <div class="campo__cabecera">
                        <label>{{ formato === 'F606' ? 'Retención renta' : 'Retención renta por terceros' }}</label>
                      </div>
                      <InputNumber v-model="form.retencionRenta" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>
                    <div class="campo">
                      <div class="campo__cabecera"><label>ISR percibido</label></div>
                      <InputNumber v-model="form.isrPercibido" mode="currency" currency="DOP" locale="es-DO" fluid />
                    </div>

                    <template v-if="formato === 'F606'">
                      <div class="campo">
                        <div class="campo__cabecera"><label>Servicios</label></div>
                        <InputNumber v-model="form.montoServicios" mode="currency" currency="DOP" locale="es-DO" fluid />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Bienes</label></div>
                        <InputNumber v-model="form.montoBienes" mode="currency" currency="DOP" locale="es-DO" fluid />
                      </div>
                    </template>

                    <template v-else-if="formato === 'F607'">
                      <div class="campo campo--ancho separador">Forma de venta</div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Efectivo</label></div>
                        <InputNumber v-model="form.montoEfectivo" mode="currency" currency="DOP" locale="es-DO" fluid />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Cheque / transferencia</label></div>
                        <InputNumber
                          v-model="form.montoChequeTransferencia"
                          mode="currency"
                          currency="DOP"
                          locale="es-DO"
                          fluid
                        />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Tarjeta</label></div>
                        <InputNumber v-model="form.montoTarjeta" mode="currency" currency="DOP" locale="es-DO" fluid />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Venta a crédito</label></div>
                        <InputNumber
                          v-model="form.montoVentaCredito"
                          mode="currency"
                          currency="DOP"
                          locale="es-DO"
                          fluid
                        />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Bonos</label></div>
                        <InputNumber v-model="form.montoBonos" mode="currency" currency="DOP" locale="es-DO" fluid />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Permuta</label></div>
                        <InputNumber v-model="form.montoPermuta" mode="currency" currency="DOP" locale="es-DO" fluid />
                      </div>
                      <div class="campo">
                        <div class="campo__cabecera"><label>Otras formas</label></div>
                        <InputNumber
                          v-model="form.montoOtrasFormas"
                          mode="currency"
                          currency="DOP"
                          locale="es-DO"
                          fluid
                        />
                      </div>
                    </template>
                  </div>
                </TabPanel>

                <!-- ── Líneas ── -->
                <TabPanel value="lineas">
                  <p v-if="!factura.lineas?.length" class="estado estado--suave">
                    El extractor no detectó líneas de detalle en este documento.
                  </p>
                  <table v-else class="lineas">
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th class="der">Cantidad</th>
                        <th class="der">Precio unitario</th>
                        <th class="der">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="l in factura.lineas" :key="l.id">
                        <td>{{ l.descripcion }}</td>
                        <td class="der">{{ l.cantidad }}</td>
                        <td class="der">{{ fmtMonto(l.precioUnitario) }}</td>
                        <td class="der fuerte">{{ fmtMonto(l.importe) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </section>

          <div class="resumenes">
            <TarjetaPanel titulo="Totales">
              <div class="totales">
                <div v-for="t in totales" :key="t.label" class="total" :class="{ 'total--fuerte': t.fuerte }">
                  <span class="total__label">{{ t.label }}</span>
                  <span class="total__valor">RD$ {{ t.valor }}</span>
                </div>
              </div>
            </TarjetaPanel>

            <TarjetaPanel titulo="Validaciones DGII">
              <p v-if="!factura.validaciones.length" class="estado estado--suave">
                Sin observaciones. La factura cumple las reglas de la DGII.
              </p>
              <div
                v-for="v in factura.validaciones"
                :key="v.id"
                class="validacion"
                :class="v.severidad === 'ERROR' ? 'validacion--error' : 'validacion--alerta'"
              >
                <i
                  class="pi"
                  :class="v.severidad === 'ERROR' ? 'pi-times-circle' : 'pi-exclamation-triangle'"
                ></i>
                <div class="validacion__texto">
                  <span class="validacion__codigo">{{ v.codigo }}</span>
                  <span class="validacion__mensaje">{{ v.mensaje }}</span>
                </div>
              </div>
            </TarjetaPanel>
          </div>
        </div>
      </div>

      <Drawer v-model:visible="verOcr" position="right" header="Texto OCR y diagnóstico" class="cajon">
        <PanelDiagnostico v-if="factura.documento" :documento-id="factura.documento.id" />
      </Drawer>
    </template>
  </AppLayout>
</template>

<style scoped>
.estado {
  margin: 0;
  font-size: 13px;
  color: var(--texto-tenue);
}
.estado--suave {
  padding: 8px 0;
}

/* ── Cabecera ── */
.cabecera {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.cabecera__izq {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.volver {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  font-size: 12px;
  color: var(--texto-tenue);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 5px;
}
.volver:hover {
  color: var(--teal);
}
.cabecera__titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cabecera__titulo h1 {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.4px;
}
.cabecera__sub {
  font-size: 12.5px;
  color: var(--texto-tenue);
}
.cabecera__acciones {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

/* ── Cuerpo ── */
.cuerpo {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 14px;
  align-items: start;
}
.derecha {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.panel {
  background: var(--superficie);
  border: 1px solid var(--borde);
  border-radius: var(--radio-tarjeta);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel--sin-padding {
  padding: 0;
  gap: 0;
  overflow: hidden;
}
.panel__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel__titulo {
  font-size: 13px;
  font-weight: 700;
}
.panel__pie {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--texto-tenue);
  gap: 10px;
}
.herramientas {
  display: flex;
  align-items: center;
  gap: 6px;
}
.herramienta {
  width: 27px;
  height: 27px;
  border: 1px solid var(--borde);
  background: var(--superficie);
  border-radius: 8px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--texto-suave);
  font-size: 11.5px;
}
.herramienta:hover {
  border-color: var(--teal);
  color: var(--teal);
}
.enlace {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--teal);
  font-weight: 700;
  cursor: pointer;
  font-size: 11.5px;
}
.enlace:hover {
  text-decoration: underline;
}

/* ── Clasificación pendiente ── */
.clasificar {
  background: var(--alerta-fondo);
  border-bottom: 1px solid var(--alerta-borde);
  padding: 13px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.clasificar p {
  margin: 0;
  font-size: 12.5px;
  color: var(--texto-medio);
}
.clasificar__campos {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.clasificar__cliente {
  width: 260px;
}
.alerta-rnc {
  grid-column: 1 / -1;
  background: var(--alerta-fondo);
  color: var(--alerta);
  border: 1px solid var(--alerta);
  padding: 10px 12px;
  border-radius: var(--radio-control);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
/* ── Pestañas: calcadas del diseño sobre los componentes de PrimeVue ── */
:deep(.p-tablist) {
  padding: 0 14px;
}
:deep(.p-tablist-tab-list) {
  gap: 2px;
  border-color: var(--borde-tenue);
}
:deep(.p-tab) {
  padding: 12px 12px 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--texto-tenue);
  border-color: transparent;
}
:deep(.p-tab-active) {
  color: var(--teal);
}
:deep(.p-tablist-active-bar) {
  background: var(--teal);
  height: 2px;
}

/* ── Campos ── */
.campos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
  padding: 16px;
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
.campo--dudoso :deep(.p-inputtext),
.campo--dudoso :deep(.p-select) {
  border-color: var(--alerta-borde);
  background: #fffcf5;
}
.campo__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}
.campo__cabecera label {
  font-size: 11px;
  font-weight: 700;
  color: var(--texto-suave);
  letter-spacing: 0.2px;
}
.campo__fila {
  display: flex;
  align-items: center;
  gap: 6px;
}
.separador {
  font-size: 12px;
  font-weight: 700;
  color: var(--texto-suave);
  border-top: 1px solid var(--borde-tenue);
  padding-top: 10px;
  margin-top: 2px;
}
.nota {
  font-size: 10.5px;
  color: var(--texto-debil);
  font-weight: 500;
}
.nota--alerta {
  color: var(--alerta);
  font-weight: 600;
}
.nota--error {
  color: var(--error);
  font-weight: 600;
}

/* ── Líneas ── */
.lineas {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.lineas th {
  text-align: left;
  padding: 9px 16px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--texto-debil);
  font-weight: 700;
  border-bottom: 1px solid var(--borde-tenue);
  background: var(--superficie-tenue);
}
.lineas td {
  padding: 10px 16px;
  border-bottom: 1px solid #f2f4f6;
  color: var(--texto-medio);
}
.der {
  text-align: right;
}
.fuerte {
  font-weight: 700;
  color: var(--texto);
}

/* ── Resúmenes ── */
.resumenes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
}
.totales {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  padding-bottom: 7px;
  border-bottom: 1px solid #f2f4f6;
}
.total__label {
  color: var(--texto-suave);
}
.total__valor {
  font-weight: 700;
  color: var(--texto);
}
.total--fuerte {
  border-bottom: 0;
  padding-top: 2px;
}
.total--fuerte .total__label {
  color: var(--texto);
  font-weight: 700;
}
.total--fuerte .total__valor {
  font-size: 16px;
}

.validacion {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  border-radius: 10px;
  padding: 9px 11px;
  border: 1px solid;
}
.validacion > i {
  font-size: 12px;
  margin-top: 1px;
}
.validacion--error {
  background: var(--error-fondo);
  border-color: var(--error-borde);
  color: var(--error);
}
.validacion--alerta {
  background: var(--alerta-fondo);
  border-color: var(--alerta-borde);
  color: var(--alerta);
}
.validacion__texto {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.validacion__codigo {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--texto);
}
.validacion__mensaje {
  font-size: 11px;
  color: var(--texto-suave);
  line-height: 1.4;
}

@media (max-width: 1200px) {
  .cuerpo {
    grid-template-columns: 1fr;
  }
  .resumenes {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.cajon {
  width: 560px !important;
  max-width: 92vw;
}
</style>
