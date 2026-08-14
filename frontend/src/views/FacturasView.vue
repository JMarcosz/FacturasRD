<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import type { ToastMessageOptions } from "primevue/toast";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import DatePicker from "primevue/datepicker";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import Select from "primevue/select";
import AppLayout from "../components/AppLayout.vue";
import AvatarIniciales from "../components/ui/AvatarIniciales.vue";
import EncabezadoPantalla from "../components/ui/EncabezadoPantalla.vue";
import Pastilla from "../components/ui/Pastilla.vue";
import TarjetaKpi from "../components/ui/TarjetaKpi.vue";
import TarjetaPanel from "../components/ui/TarjetaPanel.vue";
import Dialog from "primevue/dialog";
import {
  editarLote,
  eliminarFactura,
  eliminarLote,
  listarFacturas,
  confirmarClasificacionLote,
  type CamposLote,
  type FiltrosFacturas,
  type FormaVenta607,
} from "../api/facturas";
import {
  eliminarDocumento,
  listarDocumentosPendientesGlobales,
  subirDocumentosGlobal,
} from "../api/documentos";
import { listarClientes } from "../api/clientes";
import { descargarExcelPorRango } from "../api/exportacion";
import {
  aYyyymm,
  delta,
  obtenerEstadisticasFacturas,
  obtenerResumen,
} from "../api/estadisticas";
import { useCatalogosStore } from "../stores/catalogos";
import { useSeleccionStore } from "../stores/seleccion";
import { fmtFechaCorta, fmtMonto, fmtMontoCorto, fmtYyyymm } from "../formato";
import type {
  Cliente,
  Documento,
  EstadisticasFacturas,
  Factura,
  ResumenEstadisticas,
} from "../types";

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();

/**
 * `ToastMessageOptions` no declara `data` (aunque el componente lo reenvía
 * tal cual al slot `#message` de App.vue): se amplía aquí para poder adjuntar
 * el enlace al paso siguiente sin `as any` en cada `toast.add(...)`.
 */
interface AccionToast {
  label: string;
  ruta: { name: string; query?: Record<string, string> };
}
type ToastConAccion = ToastMessageOptions & { data?: { accion: AccionToast } };
const catalogos = useCatalogosStore();
const seleccionStore = useSeleccionStore();

const layout = ref<InstanceType<typeof AppLayout> | null>(null);

const facturas = ref<Factura[]>([]);
const pendientes = ref<Documento[]>([]);
const clientes = ref<Cliente[]>([]);
const stats = ref<EstadisticasFacturas | null>(null);
const resumen = ref<ResumenEstadisticas | null>(null);
const descartadas = ref<string[]>([]);

/**
 * La selección vive en un store (no en un `ref` local) para sobrevivir a
 * navegar al detalle de una factura y volver — antes, ese viaje desmontaba
 * la vista y la selección se perdía en silencio. El componente solo guarda
 * IDs; aquí se cruzan contra la lista actual para que el `v-model:selection`
 * de la tabla siga viendo objetos `Factura` completos.
 */
const seleccion = computed<Factura[]>({
  get: () => facturas.value.filter((f) => seleccionStore.ids.has(f.id)),
  set: (filas) => seleccionStore.set(filas.map((f) => f.id)),
});

const mostrarDialogoAsignar = ref(false);
const asignarClienteId = ref("");
const asignarFormato = ref<"F606" | "F607">("F607");
const asignandoLote = ref(false);

// ── Clasificación fiscal en lote ─────────────────────────────────────────────
// Separado de "asignar cliente" porque los campos dependen del formato: una
// venta se describe con tipo de ingreso + forma de venta, un gasto con tipo de
// bienes y servicios + forma de pago. Mezclarlos en un solo diálogo obligaría a
// mostrar cuatro campos de los que siempre sobran dos.
const mostrarDialogoFiscal = ref(false);
const fiscalTipoIngreso = ref<string | null>(null);
const fiscalFormaVenta = ref<FormaVenta607 | null>(null);
const fiscalTipoBienesServicios = ref<string | null>(null);
const fiscalFormaPago = ref<string | null>(null);
const aplicandoFiscal = ref(false);

const OPCIONES_FORMA_VENTA: Array<{ label: string; value: FormaVenta607 }> = [
  { label: "Efectivo", value: "EFECTIVO" },
  { label: "Cheque / Transferencia / Depósito", value: "CHEQUE_TRANSFERENCIA" },
  { label: "Tarjeta de débito / crédito", value: "TARJETA" },
  { label: "Venta a crédito", value: "VENTA_CREDITO" },
  { label: "Bonos o certificados de regalo", value: "BONOS" },
  { label: "Permuta", value: "PERMUTA" },
  { label: "Otras formas de venta", value: "OTRAS_FORMAS" },
];

/**
 * El formato de la selección decide qué campos tienen sentido. Si la selección
 * mezcla 606 y 607 (o trae facturas sin clasificar) no hay un juego válido de
 * campos y el diálogo lo dice en vez de aplicar algo a medias.
 */
const formatoSeleccion = computed<"F606" | "F607" | "mixto" | "sin_clasificar">(
  () => {
    const formatos = new Set(
      seleccion.value.map((f) => f.formato ?? "sin_clasificar"),
    );
    if (formatos.size !== 1) return "mixto";
    const [unico] = [...formatos];
    return unico as "F606" | "F607" | "sin_clasificar";
  },
);

const cargando = ref(true);
const subiendo = ref(false);
const arrastrando = ref(false);
const busquedaTexto = ref(stringDeQuery(route.query.q));
const inputArchivo = ref<HTMLInputElement | null>(null);
const popMasFiltros = ref<InstanceType<typeof Popover> | null>(null);

function toggleMasFiltros(ev: Event) {
  popMasFiltros.value?.toggle(ev);
}

// ── Filtros ──────────────────────────────────────────────────────────────────
// "Sin clasificar" y "Editadas a mano" NO son opciones aquí: ya son vistas
// rápidas (más abajo) y tenerlas también en estos desplegables era el mismo
// filtro expuesto dos veces, sin coordinación entre sí (podían combinarse en
// silencio y vaciar la tabla sin explicación). Cada filtro vive en un solo sitio.
type Clasificacion = "todas" | "F606" | "F607";
type Origen = "todos" | "IA" | "MANUAL";
type Confirmacion = "todas" | "si" | "no";

function stringDeQuery(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const filtros = reactive({
  clienteId: stringDeQuery(route.query.clienteId),
  clasificacion:
    (stringDeQuery(route.query.clasificacion, "todas") as Clasificacion) ||
    "todas",
  tipoNcf: stringDeQuery(route.query.tipoNcf),
  origen: (stringDeQuery(route.query.origen, "todos") as Origen) || "todos",
  confirmacion:
    (stringDeQuery(route.query.confirmacion, "todas") as Confirmacion) ||
    "todas",
});

function yyyymmDeQuery(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{6}$/.test(v)) return null;
  const anio = Number(v.slice(0, 4));
  const mesNum = Number(v.slice(4, 6));
  return new Date(anio, mesNum - 1, 1);
}

// `null` = "Todos los meses". Antes arrancaba en el mes de hoy y el listado
// salía vacío en cuanto las facturas subidas tenían fechas de otros meses
// (o de años anteriores) — exactamente lo que pasa con un lote recién
// escaneado, cuyas fechas las pone el propio comprobante, no la subida.
const mes = ref<Date | null>(yyyymmDeQuery(route.query.mes));

const opcionesCliente = computed(() => [
  { label: "Todos", value: "" },
  ...clientes.value.map((c) => ({ label: c.nombre, value: c.id })),
]);
const opcionesClasificacion: Array<{ label: string; value: Clasificacion }> = [
  { label: "Todas", value: "todas" },
  { label: "Gasto · 606", value: "F606" },
  { label: "Ingreso · 607", value: "F607" },
];
const opcionesTipoNcf = computed(() => [
  { label: "Todos", value: "" },
  ...catalogos.catalogos.tiposNcf.map((t) => ({
    label: `${t.codigo} · ${t.descripcion}`,
    value: t.codigo,
  })),
]);
const opcionesOrigen: Array<{ label: string; value: Origen }> = [
  { label: "Todos", value: "todos" },
  { label: "Extraídas por la IA", value: "IA" },
  { label: "Creadas a mano", value: "MANUAL" },
];
const opcionesConfirmacion: Array<{ label: string; value: Confirmacion }> = [
  { label: "Todas", value: "todas" },
  { label: "Confirmadas", value: "si" },
  { label: "Sin confirmar", value: "no" },
];

const nombreMes = computed(() =>
  mes.value ? fmtYyyymm(yyyymm.value).split(" ")[0] : "Todos los meses",
);
const anio = computed(() => (mes.value ? String(mes.value.getFullYear()) : ""));
// Para el resumen del sidebar/KPIs (deltas "vs. mes anterior") se usa el mes
// elegido, o el mes en curso cuando el filtro está en "Todos los meses" — esa
// comparación no tiene sentido sin un mes concreto de referencia.
const mesResumen = computed(() => mes.value ?? new Date());
const yyyymm = computed(() =>
  aYyyymm(
    new Date(
      Date.UTC(mesResumen.value.getFullYear(), mesResumen.value.getMonth(), 1),
    ),
  ),
);

function iso(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

const rango = computed(() => {
  if (!mes.value)
    return {
      desde: undefined as string | undefined,
      hasta: undefined as string | undefined,
    };
  const y = mes.value.getFullYear();
  const m = mes.value.getMonth();
  return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m + 1, 0)) };
});

/** Lo que entiende la API. El resto (tipo NCF, origen, confirmación, vista, texto) se filtra aquí. */
const filtrosApi = computed<FiltrosFacturas>(() => ({
  clienteId: filtros.clienteId || undefined,
  formato:
    filtros.clasificacion === "F606" || filtros.clasificacion === "F607"
      ? filtros.clasificacion
      : undefined,
  desde: rango.value.desde,
  hasta: rango.value.hasta,
}));

// ── Vistas rápidas ───────────────────────────────────────────────────────────
// 'por_confirmar' es la antigua pantalla de Triaje, consolidada aquí como
// filtro guardado: el ítem "Triaje" del menú y el hilo conductor
// (`useHiloConductor`) navegan a /facturas?vista=por_confirmar.
type Vista =
  | "sin_clasificar"
  | "error"
  | "por_confirmar"
  | "itbis_alto"
  | "editadas";
const vistaInicial = stringDeQuery(route.query.vista);
const vista = ref<Vista | null>(
  vistaInicial === "sin_clasificar" ||
    vistaInicial === "error" ||
    vistaInicial === "por_confirmar" ||
    vistaInicial === "itbis_alto" ||
    vistaInicial === "editadas"
    ? vistaInicial
    : null,
);

function tieneError(f: Factura): boolean {
  return (f.validaciones ?? []).some((v) => v.severidad === "ERROR");
}

const PREDICADOS: Record<Vista, (f: Factura) => boolean> = {
  sin_clasificar: (f) => !f.formato,
  error: tieneError,
  por_confirmar: (f) => !!f.clienteId && !f.clasificacionConfirmada,
  itbis_alto: (f) => Number(f.itbisFacturado) > 5000,
  editadas: (f) => f.origen === "EDITADA",
};

const vistas = computed(() => {
  const def: Array<{
    id: Vista;
    label: string;
    tono: "alerta" | "error" | "ok" | "neutro";
  }> = [
    { id: "sin_clasificar", label: "Sin clasificar", tono: "alerta" },
    { id: "error", label: "Con error", tono: "error" },
    { id: "por_confirmar", label: "Por confirmar", tono: "alerta" },
  ];
  return def.map((v) => ({
    ...v,
    n: facturas.value.filter(PREDICADOS[v.id]).length,
  }));
});

function alternarVista(id: Vista) {
  vista.value = vista.value === id ? null : id;
}

const facturasFiltradas = computed(() => {
  let lista = facturas.value;
  if (vista.value) lista = lista.filter(PREDICADOS[vista.value]);
  if (filtros.tipoNcf)
    lista = lista.filter((f) => f.tipoNcf?.codigo === filtros.tipoNcf);
  if (filtros.origen !== "todos")
    lista = lista.filter((f) => f.origen === filtros.origen);
  if (filtros.confirmacion !== "todas")
    lista = lista.filter(
      (f) => f.clasificacionConfirmada === (filtros.confirmacion === "si"),
    );
  const q = busquedaTexto.value.trim().toLowerCase();
  if (q) {
    lista = lista.filter((f) =>
      [
        f.nombreEmisor,
        f.identificacionEmisor,
        f.ncf,
        f.cliente?.nombre,
        f.montoFacturado,
        f.documento?.filename,
      ].some((v) => v?.toLowerCase().includes(q)),
    );
  }
  return lista;
});

// ── KPIs ─────────────────────────────────────────────────────────────────────
const mesAnterior = computed(() =>
  resumen.value
    ? fmtYyyymm(resumen.value.mesAnterior.yyyymm).split(" ")[0].toLowerCase()
    : "",
);

const kpis = computed(() => {
  const s = stats.value;
  const a = resumen.value?.mes;
  const b = resumen.value?.mesAnterior;
  const contra = mesAnterior.value ? `vs. ${mesAnterior.value}` : "";
  return [
    {
      label: "Facturas del mes",
      valor: String(s?.escaneadas ?? 0),
      icono: "pi-receipt",
      color: "var(--teal)",
      fondo: "var(--teal-suave)",
      delta: a && b ? delta(a.escaneadas, b.escaneadas) : null,
      sub: contra,
    },
    {
      label: "ITBIS acumulado",
      valor: fmtMontoCorto(s?.itbisFacturado ?? 0),
      icono: "pi-percentage",
      color: "var(--info)",
      fondo: "var(--info-fondo)",
      delta:
        a && b
          ? delta(Number(a.itbisFacturado), Number(b.itbisFacturado))
          : null,
      sub: contra,
    },
    {
      label: "Sin clasificar",
      valor: String(s?.sinClasificar ?? 0),
      icono: "pi-inbox",
      color: "var(--alerta)",
      fondo: "var(--alerta-fondo)",
      delta: a && b ? delta(a.sinClasificar, b.sinClasificar) : null,
      sub: contra,
      subirEsMalo: true,
    },
    {
      label: "Con error de validación",
      valor: String(s?.conErrorValidacion ?? 0),
      icono: "pi-exclamation-triangle",
      color: "var(--error)",
      fondo: "var(--error-fondo)",
      delta: a && b ? delta(a.conErrorValidacion, b.conErrorValidacion) : null,
      sub: "bloquean el TXT",
      subirEsMalo: true,
    },
  ];
});

// ── Requiere tu atención ─────────────────────────────────────────────────────
function humanizar(codigo: string): string {
  const texto = codigo.replace(/_/g, " ").toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const alertas = computed(() =>
  facturas.value
    .filter((f) => tieneError(f) && !descartadas.value.includes(f.id))
    .slice(0, 4)
    .map((f) => {
      const v = f.validaciones.find((x) => x.severidad === "ERROR")!;
      return {
        id: f.id,
        titulo: humanizar(v.codigo),
        detalle: `${v.mensaje} · ${f.nombreEmisor ?? "Emisor desconocido"}${f.ncf ? ` (${f.ncf})` : ""}`,
      };
    }),
);

// ── Carga ────────────────────────────────────────────────────────────────────
async function cargarFacturas() {
  const [lista, totales] = await Promise.all([
    listarFacturas(filtrosApi.value),
    obtenerEstadisticasFacturas(filtrosApi.value),
  ]);
  facturas.value = lista;
  stats.value = totales;
}

async function cargarResumen() {
  resumen.value = await obtenerResumen(
    yyyymm.value,
    filtros.clienteId || undefined,
  );
}

async function cargarPendientes() {
  pendientes.value = await listarDocumentosPendientesGlobales();
}

async function recargar() {
  cargando.value = true;
  try {
    await Promise.all([cargarFacturas(), cargarResumen(), cargarPendientes()]);
  } finally {
    cargando.value = false;
  }
}

watch(filtrosApi, async () => {
  seleccion.value = [];
  await Promise.all([cargarFacturas(), cargarResumen()]);
});

/**
 * Filtros, mes y búsqueda reflejados en la URL: volver desde el detalle de
 * una factura (o compartir el enlace) restaura exactamente lo que se estaba
 * viendo. Se arma como un objeto plano (`router.replace`, no `push`, para no
 * ensuciar el historial en cada tecla) y solo lleva las claves con valor —
 * una URL con todos los "todos"/"todas" explícitos sería ilegible.
 */
const queryPersistido = computed<Record<string, string>>(() => {
  const q: Record<string, string> = {};
  if (filtros.clienteId) q.clienteId = filtros.clienteId;
  if (filtros.clasificacion !== "todas")
    q.clasificacion = filtros.clasificacion;
  if (filtros.tipoNcf) q.tipoNcf = filtros.tipoNcf;
  if (filtros.origen !== "todos") q.origen = filtros.origen;
  if (filtros.confirmacion !== "todas") q.confirmacion = filtros.confirmacion;
  if (mes.value)
    q.mes = `${mes.value.getFullYear()}${String(mes.value.getMonth() + 1).padStart(2, "0")}`;
  if (busquedaTexto.value.trim()) q.q = busquedaTexto.value.trim();
  if (vista.value) q.vista = vista.value;
  return q;
});

watch(queryPersistido, (q) => router.replace({ name: "facturas", query: q }));

// ── Acciones ─────────────────────────────────────────────────────────────────
function refrescarSidebar() {
  layout.value?.refrescarResumen();
}

function abrirFactura(f: Factura) {
  router.push({ name: "factura-detalle", params: { facturaId: f.id } });
}

function confirmarEliminar(f: Factura) {
  confirm.require({
    header: "Eliminar factura",
    message: `Se eliminará la factura de ${f.nombreEmisor ?? "emisor desconocido"}${f.ncf ? ` (${f.ncf})` : ""}. Esta acción no se puede deshacer.`,
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Eliminar",
    rejectLabel: "Cancelar",
    acceptProps: { severity: "danger", size: "small" },
    rejectProps: { severity: "secondary", outlined: true, size: "small" },
    accept: async () => {
      try {
        await eliminarFactura(f.id);
        seleccion.value = seleccion.value.filter((s) => s.id !== f.id);
        await Promise.all([cargarFacturas(), cargarResumen()]);
        refrescarSidebar();
        toast.add({
          severity: "success",
          summary: "Factura eliminada",
          life: 3000,
        });
      } catch (e: any) {
        toast.add({
          severity: "error",
          summary: "No se pudo eliminar",
          detail: e?.response?.data?.message ?? "Intenta de nuevo.",
          life: 5000,
        });
      }
    },
  });
}

function confirmarEliminarSeleccion() {
  const ids = seleccion.value.map((f) => f.id);
  if (ids.length === 0) return;
  confirm.require({
    header: "Eliminar facturas",
    message: `Se eliminarán ${ids.length} ${ids.length === 1 ? "factura" : "facturas"}. Esta acción no se puede deshacer.`,
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Eliminar",
    rejectLabel: "Cancelar",
    acceptProps: { severity: "danger", size: "small" },
    rejectProps: { severity: "secondary", outlined: true, size: "small" },
    accept: async () => {
      try {
        const r = await eliminarLote(ids);
        seleccion.value = [];
        await Promise.all([cargarFacturas(), cargarResumen()]);
        refrescarSidebar();
        toast.add({
          severity: r.fallidas.length ? "warn" : "success",
          summary: `${r.procesadas} de ${r.solicitadas} eliminadas`,
          detail: r.fallidas.length
            ? `${r.fallidas.length} no se pudieron eliminar.`
            : undefined,
          life: 4000,
        });
      } catch (e: any) {
        toast.add({
          severity: "error",
          summary: "No se pudieron eliminar",
          detail: e?.response?.data?.message ?? "Intenta de nuevo.",
          life: 5000,
        });
      }
    },
  });
}

async function asignarClienteYFormatoLote() {
  if (!asignarClienteId.value || seleccion.value.length === 0) return;
  asignandoLote.value = true;
  try {
    const ids = seleccion.value.map((f) => f.id);
    const r = await editarLote(ids, {
      clienteId: asignarClienteId.value,
      formato: asignarFormato.value,
    });
    seleccion.value = [];
    mostrarDialogoAsignar.value = false;
    await Promise.all([cargarFacturas(), cargarResumen()]);
    refrescarSidebar();
    const opciones: ToastConAccion = {
      severity: r.fallidas.length ? "warn" : "success",
      summary: `${r.procesadas} de ${r.solicitadas} clasificadas`,
      detail: r.fallidas.length
        ? `${r.fallidas.length} no se pudieron clasificar.`
        : undefined,
      life: 4000,
      data:
        r.procesadas > 0
          ? {
              accion: {
                label: "Confirmar",
                ruta: { name: "facturas", query: { vista: "por_confirmar" } },
              },
            }
          : undefined,
    };
    toast.add(opciones);
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "No se pudieron clasificar",
      detail: e?.response?.data?.message ?? "Intenta de nuevo.",
      life: 5000,
    });
  } finally {
    asignandoLote.value = false;
  }
}

function abrirDialogoFiscal() {
  fiscalTipoIngreso.value = null;
  fiscalFormaVenta.value = null;
  fiscalTipoBienesServicios.value = null;
  fiscalFormaPago.value = null;
  mostrarDialogoFiscal.value = true;
}

/** Solo viajan los campos que el contador realmente eligió: un `null` no se manda. */
const cambiosFiscales = computed<CamposLote>(() => {
  const cambios: CamposLote = {};
  if (formatoSeleccion.value === "F607") {
    if (fiscalTipoIngreso.value) cambios.tipoIngreso = fiscalTipoIngreso.value;
    if (fiscalFormaVenta.value) cambios.formaVenta = fiscalFormaVenta.value;
  } else if (formatoSeleccion.value === "F606") {
    if (fiscalTipoBienesServicios.value)
      cambios.tipoBienesServicios = fiscalTipoBienesServicios.value;
    if (fiscalFormaPago.value) cambios.formaPago = fiscalFormaPago.value;
  }
  return cambios;
});

async function aplicarClasificacionFiscalLote() {
  const cambios = cambiosFiscales.value;
  if (Object.keys(cambios).length === 0 || seleccion.value.length === 0) return;
  aplicandoFiscal.value = true;
  try {
    const ids = seleccion.value.map((f) => f.id);
    const r = await editarLote(ids, { cambios });
    seleccion.value = [];
    mostrarDialogoFiscal.value = false;
    await Promise.all([cargarFacturas(), cargarResumen()]);
    refrescarSidebar();
    const opciones: ToastConAccion = {
      severity: r.fallidas.length ? "warn" : "success",
      summary: `${r.procesadas} de ${r.solicitadas} actualizadas`,
      detail: r.fallidas.length
        ? `${r.fallidas.length} fallaron: ${r.fallidas[0].motivo}`
        : undefined,
      life: 5000,
      data:
        r.procesadas > 0
          ? {
              accion: {
                label: "Confirmar",
                ruta: { name: "facturas", query: { vista: "por_confirmar" } },
              },
            }
          : undefined,
    };
    toast.add(opciones);
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "No se pudo aplicar la clasificación",
      detail: e?.response?.data?.message ?? "Intenta de nuevo.",
      life: 5000,
    });
  } finally {
    aplicandoFiscal.value = false;
  }
}

async function confirmarClasificacionSeleccion() {
  const ids = seleccion.value.map((f) => f.id);
  if (ids.length === 0) return;
  try {
    const r = await confirmarClasificacionLote(ids);
    seleccion.value = [];
    await cargarFacturas();
    const opciones: ToastConAccion = {
      severity: "success",
      summary: `${r.procesadas} clasificaciones confirmadas`,
      life: 4000,
      data:
        r.procesadas > 0
          ? {
              accion: {
                label: "Descargar reportes",
                ruta: { name: "reporteria" },
              },
            }
          : undefined,
    };
    toast.add(opciones);
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "Error al confirmar",
      detail: e?.response?.data?.message ?? "Intenta de nuevo.",
      life: 5000,
    });
  }
}

async function exportarExcel() {
  if (filtros.clasificacion !== "F606" && filtros.clasificacion !== "F607") {
    toast.add({
      severity: "warn",
      summary: "Elige el formato",
      detail:
        "El Excel se genera por formato: filtra Clasificación por 606 o 607.",
      life: 5000,
    });
    return;
  }
  const { desde, hasta } = rango.value;
  if (!desde || !hasta) {
    toast.add({
      severity: "warn",
      summary: "Elige un mes",
      detail:
        'El Excel se genera por rango de fechas: selecciona un mes en vez de "Todos los meses".',
      life: 5000,
    });
    return;
  }
  await descargarExcelPorRango(
    filtros.clienteId || undefined,
    filtros.clasificacion,
    desde,
    hasta,
  );
}

// ── Escáner ──────────────────────────────────────────────────────────────────
async function subirArchivos(lista: FileList | File[]) {
  const archivos = Array.from(lista);
  if (archivos.length === 0) return;
  subiendo.value = true;
  try {
    const resultado = await subirDocumentosGlobal(archivos);
    await Promise.all([cargarFacturas(), cargarPendientes()]);
    const duplicados = resultado.filter((d) => d.duplicado).length;
    const nuevos = resultado.length - duplicados;
    // Antes decía siempre "N en cola" aunque el archivo ya existiera (dedup
    // por sha256, sin crear nada) — parecía que la subida funcionaba y en
    // realidad no entraba nada nuevo a proceso.
    if (duplicados === 0) {
      toast.add({
        severity: "success",
        summary: `${nuevos} en cola`,
        life: 3000,
      });
    } else if (nuevos === 0) {
      toast.add({
        severity: "warn",
        summary: `${duplicados === 1 ? "Ya existía" : `Las ${duplicados} ya existían`}`,
        detail:
          "Ningún archivo nuevo entró a proceso: ya se habían subido antes.",
        life: 6000,
      });
    } else {
      toast.add({
        severity: "warn",
        summary: `${nuevos} en cola · ${duplicados} ya existían`,
        detail: "Los que ya existían no se volvieron a procesar.",
        life: 6000,
      });
    }
  } catch (e: unknown) {
    const mensaje =
      (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? "No se pudieron subir los archivos.";
    toast.add({
      severity: "error",
      summary: "Error al subir",
      detail: mensaje,
      life: 6000,
    });
  } finally {
    subiendo.value = false;
  }
}

function onArchivosSeleccionados(ev: Event) {
  const input = ev.target as HTMLInputElement;
  if (input.files) subirArchivos(input.files);
  input.value = "";
}

function abrirSelector() {
  inputArchivo.value?.click();
}

function onDrop(ev: DragEvent) {
  arrastrando.value = false;
  if (ev.dataTransfer?.files) subirArchivos(ev.dataTransfer.files);
}

async function descartarPendiente(id: string) {
  await eliminarDocumento(id);
  await cargarPendientes();
}

const ESTADOS_DOC = {
  PENDIENTE: {
    etiqueta: "EN COLA",
    tono: "neutro" as const,
    icono: "pi-clock",
    color: "var(--texto-suave)",
  },
  PROCESANDO: {
    etiqueta: "PROCESANDO",
    tono: "teal" as const,
    icono: "pi-spin pi-spinner",
    color: "var(--teal)",
  },
  EXTRAIDO: {
    etiqueta: "LISTO",
    tono: "ok" as const,
    icono: "pi-check-circle",
    color: "var(--ok)",
  },
  ERROR: {
    etiqueta: "ERROR",
    tono: "error" as const,
    icono: "pi-times-circle",
    color: "var(--error)",
  },
};

function haceCuanto(iso: string): string {
  const seg = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (seg < 60) return "subido hace unos segundos";
  const min = Math.round(seg / 60);
  if (min < 60) return `subido hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `subido hace ${horas} h`;
  return `subido hace ${Math.round(horas / 24)} d`;
}

function detallePendiente(p: Documento): string {
  if (p.estado === "ERROR") return p.error ?? "No se pudo procesar el archivo";
  if (p.estado === "PROCESANDO")
    return p.paginas
      ? `${p.paginas} páginas · extrayendo campos`
      : "Extrayendo campos";
  return haceCuanto(p.createdAt);
}

// ── Celdas ───────────────────────────────────────────────────────────────────
function textoClasificacion(f: Factura): string {
  if (!f.formato) return "Sin clasificar";
  return f.formato === "F607" ? "INGRESO" : "GASTO";
}

function tonoClasificacion(f: Factura): "ok" | "neutro" | "alerta" {
  if (!f.formato) return "alerta";
  return f.formato === "F607" ? "ok" : "neutro";
}

function textoTipoGasto(f: Factura): string {
  if (f.formato !== "F606" || !f.tipoBienesServicios) return "—";
  const entrada = catalogos.catalogos.tiposBienesServicios606.find(
    (t) => t.codigo === f.tipoBienesServicios,
  );
  return entrada?.descripcion ?? f.tipoBienesServicios;
}

let eventSource: EventSource | null = null;

onMounted(async () => {
  catalogos.cargar();
  clientes.value = await listarClientes();
  await recargar();

  // Observador reactivo por Server-Sent Events (SSE): sin polling de intervalo
  // El backend notifica en tiempo real al navegador en el instante que cada factura se completa
  eventSource = new EventSource("/api/documentos/stream");
  eventSource.onmessage = () => {
    cargarFacturas();
    cargarPendientes();
    refrescarSidebar();
  };
});

onUnmounted(() => {
  if (eventSource) eventSource.close();
});
</script>

<template>
  <AppLayout
    ref="layout"
    v-model:busqueda="busquedaTexto"
    mostrar-busqueda
    placeholder-busqueda="Buscar comercio, RNC o NCF…"
  >
    <template #acciones>
      <Button
        label="Subir facturas"
        icon="pi pi-upload"
        size="small"
        :loading="subiendo"
        @click="abrirSelector"
      />
      <input
        ref="inputArchivo"
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp"
        style="display: none"
        @change="onArchivosSeleccionados"
      />
    </template>

    <!-- El Toast y el ConfirmDialog son globales, montados una sola vez en
         App.vue: montar otra instancia aquí duplicaba el diálogo de
         confirmación (ambas escuchan el mismo bus de eventos y se abren a la
         vez, pero solo la que recibe el clic se cierra — la otra queda
         "pegada" en pantalla). -->
    <EncabezadoPantalla
      titulo="Facturas"
      subtitulo="Todo lo escaneado por la IA, listo para clasificar y declarar."
    >
      <template #acciones>
        <!-- El texto del mes lo pinta la vista: el locale de PrimeVue es global y
             está en inglés, así que el input del DatePicker va oculto encima. -->
        <div class="control control--picker">
          <i class="pi pi-calendar control__icono"></i>
          <span class="control__valor">{{
            anio ? `${nombreMes} ${anio}` : nombreMes
          }}</span>
          <i class="pi pi-chevron-down control__chevron"></i>
          <DatePicker v-model="mes" view="month" class="picker-oculto" />
        </div>
        <button
          type="button"
          class="control control--boton"
          @click="exportarExcel"
        >
          <i class="pi pi-download control__icono"></i>Excel
        </button>
      </template>
    </EncabezadoPantalla>

    <div class="kpis">
      <TarjetaKpi v-for="k in kpis" :key="k.label" v-bind="k" />
    </div>

    <TarjetaPanel sin-padding>
      <div class="cabecera">
        <div class="filtros">
          <IconField class="buscador">
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="busquedaTexto"
              placeholder="Filtrar por comercio, RNC, NCF o monto…"
            />
          </IconField>

          <div class="filtro" :class="{ 'filtro--activo': filtros.clienteId }">
            <span class="filtro__label">Cliente:</span>
            <Select
              v-model="filtros.clienteId"
              :options="opcionesCliente"
              option-label="label"
              option-value="value"
            />
          </div>

          <div class="filtro filtro--picker" :class="{ 'filtro--activo': mes }">
            <span class="filtro__label">Mes:</span>
            <span class="filtro__valor">{{ nombreMes }}</span>
            <i
              v-if="mes"
              class="pi pi-times filtro__limpiar"
              title="Ver todos los meses"
              @click.stop="mes = null"
            ></i>
            <i v-else class="pi pi-chevron-down filtro__chevron"></i>
            <DatePicker v-model="mes" view="month" class="picker-oculto" />
          </div>

          <div v-if="mes" class="filtro filtro--activo filtro--picker">
            <span class="filtro__label">Año:</span>
            <span class="filtro__valor">{{ anio }}</span>
            <i class="pi pi-chevron-down filtro__chevron"></i>
            <DatePicker v-model="mes" view="year" class="picker-oculto" />
          </div>

          <div
            class="filtro"
            :class="{ 'filtro--activo': filtros.clasificacion !== 'todas' }"
          >
            <span class="filtro__label">Clasificación:</span>
            <Select
              v-model="filtros.clasificacion"
              :options="opcionesClasificacion"
              option-label="label"
              option-value="value"
            />
          </div>

          <div
            class="filtro filtro--ancho"
            :class="{ 'filtro--activo': filtros.tipoNcf }"
          >
            <span class="filtro__label">Tipo NCF:</span>
            <Select
              v-model="filtros.tipoNcf"
              :options="opcionesTipoNcf"
              option-label="label"
              option-value="value"
            />
          </div>

          <div class="separador"></div>

          <button
            type="button"
            class="accion-lote accion-lote--teal"
            :disabled="seleccion.length === 0"
            @click="mostrarDialogoAsignar = true"
          >
            <i class="pi pi-tag"></i>Asignar cliente
            <span v-if="seleccion.length">({{ seleccion.length }})</span>
          </button>

          <button
            type="button"
            class="accion-lote accion-lote--teal"
            :disabled="seleccion.length === 0"
            @click="abrirDialogoFiscal"
          >
            <i class="pi pi-sliders-h"></i>Clasificación fiscal
            <span v-if="seleccion.length">({{ seleccion.length }})</span>
          </button>

          <button
            type="button"
            class="accion-lote accion-lote--ok"
            :disabled="seleccion.length === 0"
            @click="confirmarClasificacionSeleccion"
          >
            <i class="pi pi-check-circle"></i>Confirmar
            <span v-if="seleccion.length">({{ seleccion.length }})</span>
          </button>

          <button
            type="button"
            class="peligro"
            :disabled="seleccion.length === 0"
            @click="confirmarEliminarSeleccion"
          >
            <i class="pi pi-trash"></i>Eliminar
            <span v-if="seleccion.length">({{ seleccion.length }})</span>
          </button>

          <button
            type="button"
            class="accion-lote"
            @click="toggleMasFiltros"
          >
            <i class="pi pi-filter"></i>Más filtros
          </button>

          <Popover ref="popMasFiltros">
            <div class="mas-filtros__panel">
              <label for="flt-origen">
                <span>Origen</span>
                <Select
                  v-model="filtros.origen"
                  input-id="flt-origen"
                  :options="opcionesOrigen"
                  option-label="label"
                  option-value="value"
                />
              </label>
              <label for="flt-confirmacion">
                <span>Confirmación</span>
                <Select
                  v-model="filtros.confirmacion"
                  input-id="flt-confirmacion"
                  :options="opcionesConfirmacion"
                  option-label="label"
                  option-value="value"
                />
              </label>
            </div>
          </Popover>
        </div>

        <div class="vistas">
          <span class="vistas__label">Vistas rápidas:</span>
          <button
            v-for="v in vistas"
            :key="v.id"
            type="button"
            class="chip"
            :class="[`chip--${v.tono}`, { 'chip--activo': vista === v.id }]"
            @click="alternarVista(v.id)"
          >
            {{ v.label }}<span class="chip__n">{{ v.n }}</span>
            <i v-if="vista === v.id" class="pi pi-times chip__cerrar"></i>
          </button>
        </div>
      </div>

      <DataTable
        v-model:selection="seleccion"
        :value="facturasFiltradas"
        :loading="cargando"
        selection-mode="multiple"
        data-key="id"
        paginator
        :rows="10"
        size="small"
        scrollable
        table-style="min-width: 1180px"
        sort-field="fechaComprobante"
        :sort-order="-1"
        paginator-template="CurrentPageReport PrevPageLink PageLinks NextPageLink"
        current-page-report-template="Mostrando {first}–{last} de {totalRecords} facturas"
        class="tabla"
        @row-click="(e: { data: Factura }) => abrirFactura(e.data)"
      >
        <template #empty>
          <div class="vacio">
            Todavía no hay facturas que coincidan con estos filtros.
          </div>
        </template>

        <Column selection-mode="multiple" header-style="width: 34px" />

        <Column field="nombreEmisor" header="Comercio" sortable>
          <template #body="{ data }: { data: Factura }">
            <div class="comercio">
              <AvatarIniciales :nombre="data.nombreEmisor" />
              <span class="comercio__nombre">{{
                data.nombreEmisor ?? "—"
              }}</span>
            </div>
          </template>
        </Column>

        <Column header="RNC">
          <template #body="{ data }: { data: Factura }">
            <span class="tenue">{{
              data.identificacionEmisor?.replace(/-/g, "") || "—"
            }}</span>
          </template>
        </Column>

        <Column field="fechaComprobante" header="Fecha" sortable>
          <template #body="{ data }: { data: Factura }">
            <span class="tenue nowrap">{{
              fmtFechaCorta(data.fechaComprobante)
            }}</span>
          </template>
        </Column>

        <Column header="Tipo NCF">
          <template #body="{ data }: { data: Factura }">
            <span class="tenue nowrap">{{
              data.tipoNcf?.descripcion ?? "—"
            }}</span>
          </template>
        </Column>

        <Column field="ncf" header="NCF">
          <template #body="{ data }: { data: Factura }">
            <span class="ncf">{{ data.ncf?.replace(/-/g, "") || "—" }}</span>
          </template>
        </Column>

        <Column header="Clasificación">
          <template #body="{ data }: { data: Factura }">
            <Pastilla
              :texto="textoClasificacion(data)"
              :tono="tonoClasificacion(data)"
              punto
            />
          </template>
        </Column>

        <Column header="Tipo de gasto">
          <template #body="{ data }: { data: Factura }">
            <span class="suave">{{ textoTipoGasto(data) }}</span>
          </template>
        </Column>

        <Column header="ITBIS" header-class="col-der" body-class="col-der">
          <template #body="{ data }: { data: Factura }">
            <span class="tenue">{{ fmtMonto(data.itbisFacturado) }}</span>
          </template>
        </Column>

        <Column header="Monto RD$" header-class="col-der" body-class="col-der">
          <template #body="{ data }: { data: Factura }">
            <span class="monto">{{ fmtMonto(data.montoFacturado) }}</span>
          </template>
        </Column>

        <Column header="Acciones" header-class="col-der" body-class="col-der">
          <template #body="{ data }: { data: Factura }">
            <div class="acciones">
              <button
                type="button"
                class="accion"
                title="Editar"
                aria-label="Editar factura"
                @click="abrirFactura(data)"
              >
                <i class="pi pi-pencil"></i>
              </button>
              <button
                type="button"
                class="accion accion--peligro"
                title="Eliminar"
                aria-label="Eliminar factura"
                @click="confirmarEliminar(data)"
              >
                <i class="pi pi-trash"></i>
              </button>
            </div>
          </template>
        </Column>
      </DataTable>
    </TarjetaPanel>

    <div class="inferior">
      <TarjetaPanel
        titulo="Escanear facturas"
        subtitulo="PDF o imagen. La IA extrae RNC, NCF, ITBIS y monto."
      >
        <template #cabecera>
          <Pastilla
            v-if="pendientes.length"
            :texto="`${pendientes.length} en proceso`"
            tono="teal"
          />
        </template>

        <div
          class="dropzone"
          :class="{ 'dropzone--activa': arrastrando }"
          @click="abrirSelector"
          @dragover.prevent="arrastrando = true"
          @dragleave.prevent="arrastrando = false"
          @drop.prevent="onDrop"
        >
          <div class="dropzone__icono"><i class="pi pi-cloud-upload"></i></div>
          <span class="dropzone__titulo">{{
            subiendo ? "Subiendo…" : "Arrastra los archivos aquí"
          }}</span>
          <span class="dropzone__pie"
            >o
            <span class="dropzone__enlace">selecciona desde tu equipo</span> ·
            máx. 20 MB</span
          >
        </div>

        <div v-if="pendientes.length" class="pendientes">
          <div v-for="p in pendientes" :key="p.id" class="pendiente">
            <i
              class="pi"
              :class="ESTADOS_DOC[p.estado].icono"
              :style="{ color: ESTADOS_DOC[p.estado].color }"
            ></i>
            <div class="pendiente__texto">
              <span class="pendiente__archivo">{{ p.filename }}</span>
              <span class="pendiente__detalle">{{ detallePendiente(p) }}</span>
            </div>
            <Pastilla
              :texto="ESTADOS_DOC[p.estado].etiqueta"
              :tono="ESTADOS_DOC[p.estado].tono"
            />
            <button
              v-if="p.estado === 'ERROR'"
              type="button"
              class="descartar"
              @click="descartarPendiente(p.id)"
            >
              Descartar
            </button>
          </div>
        </div>
      </TarjetaPanel>

      <TarjetaPanel titulo="Requiere tu atención">
        <template #cabecera>
          <i
            class="pi pi-ellipsis-h"
            style="font-size: 13px; color: var(--texto-debil)"
          ></i>
        </template>

        <p v-if="alertas.length === 0" class="sin-alertas">
          Sin errores de validación pendientes.
        </p>

        <div v-for="a in alertas" :key="a.id" class="alerta">
          <div class="alerta__cuerpo">
            <i class="pi pi-exclamation-circle"></i>
            <div class="alerta__texto">
              <span class="alerta__titulo">{{ a.titulo }}</span>
              <span class="alerta__detalle">{{ a.detalle }}</span>
            </div>
          </div>
          <div class="alerta__acciones">
            <button
              type="button"
              class="alerta__accion"
              @click="
                router.push({
                  name: 'factura-detalle',
                  params: { facturaId: a.id },
                })
              "
            >
              Revisar ahora
            </button>
            <button
              type="button"
              class="alerta__descartar"
              @click="descartadas.push(a.id)"
            >
              Descartar
            </button>
          </div>
        </div>
      </TarjetaPanel>
    </div>

    <Dialog
      v-model:visible="mostrarDialogoAsignar"
      header="Asignar cliente y formato"
      :modal="true"
      :style="{ width: '420px' }"
    >
      <div class="dialogo-asignar">
        <label for="dlg-asignar-cliente">
          <span>Cliente (contribuyente)</span>
          <Select
            v-model="asignarClienteId"
            input-id="dlg-asignar-cliente"
            :options="opcionesCliente.filter((o) => o.value !== '')"
            option-label="label"
            option-value="value"
            placeholder="Selecciona un cliente…"
            class="w-full"
          />
        </label>
        <label for="dlg-asignar-formato">
          <span>Formato</span>
          <Select
            v-model="asignarFormato"
            input-id="dlg-asignar-formato"
            :options="[
              { label: 'Ingreso · 607', value: 'F607' },
              { label: 'Gasto · 606', value: 'F606' },
            ]"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </label>
      </div>
      <template #footer>
        <Button
          label="Cancelar"
          severity="secondary"
          outlined
          size="small"
          @click="mostrarDialogoAsignar = false"
        />
        <Button
          :label="`Asignar a ${seleccion.length} facturas`"
          icon="pi pi-check"
          size="small"
          :loading="asignandoLote"
          :disabled="!asignarClienteId"
          @click="asignarClienteYFormatoLote"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="mostrarDialogoFiscal"
      header="Clasificación fiscal en lote"
      :modal="true"
      :style="{ width: '460px' }"
    >
      <div class="dialogo-asignar">
        <p v-if="formatoSeleccion === 'mixto'" class="aviso-fiscal">
          La selección mezcla formatos (o incluye facturas sin clasificar). El
          607 y el 606 no comparten campos: filtra por un formato, o asigna
          primero cliente y formato.
        </p>
        <p
          v-else-if="formatoSeleccion === 'sin_clasificar'"
          class="aviso-fiscal"
        >
          Estas facturas todavía no tienen cliente ni formato. Usa
          <strong>Asignar cliente</strong> primero — sin formato no se sabe si
          van al 607 o al 606.
        </p>

        <template v-else-if="formatoSeleccion === 'F607'">
          <label for="dlg-fiscal-tipo-ingreso">
            <span>Tipo de ingreso</span>
            <Select
              v-model="fiscalTipoIngreso"
              input-id="dlg-fiscal-tipo-ingreso"
              :options="
                catalogos.etiquetar(catalogos.catalogos.tiposIngreso607)
              "
              option-label="etiqueta"
              option-value="codigo"
              placeholder="Sin cambio"
              show-clear
              class="w-full"
            />
          </label>
          <label for="dlg-fiscal-forma-venta">
            <span>Forma de venta</span>
            <Select
              v-model="fiscalFormaVenta"
              input-id="dlg-fiscal-forma-venta"
              :options="OPCIONES_FORMA_VENTA"
              option-label="label"
              option-value="value"
              placeholder="Sin cambio"
              show-clear
              class="w-full"
            />
            <small class="pista-fiscal">
              Lleva el total (monto + ITBIS) de cada factura a esa columna. Es
              lo que resuelve el error «forma de venta indefinida» que bloquea
              el TXT.
            </small>
          </label>
        </template>

        <template v-else>
          <label for="dlg-fiscal-tipo-bienes">
            <span>Tipo de bienes y servicios</span>
            <Select
              v-model="fiscalTipoBienesServicios"
              input-id="dlg-fiscal-tipo-bienes"
              :options="
                catalogos.etiquetar(catalogos.catalogos.tiposBienesServicios606)
              "
              option-label="etiqueta"
              option-value="codigo"
              placeholder="Sin cambio"
              show-clear
              class="w-full"
            />
          </label>
          <label for="dlg-fiscal-forma-pago">
            <span>Forma de pago</span>
            <Select
              v-model="fiscalFormaPago"
              input-id="dlg-fiscal-forma-pago"
              :options="catalogos.etiquetar(catalogos.catalogos.formasPago606)"
              option-label="etiqueta"
              option-value="codigo"
              placeholder="Sin cambio"
              show-clear
              class="w-full"
            />
          </label>
        </template>
      </div>
      <template #footer>
        <Button
          label="Cancelar"
          severity="secondary"
          outlined
          size="small"
          @click="mostrarDialogoFiscal = false"
        />
        <Button
          :label="`Aplicar a ${seleccion.length} facturas`"
          icon="pi pi-check"
          size="small"
          :loading="aplicandoFiscal"
          :disabled="Object.keys(cambiosFiscales).length === 0"
          @click="aplicarClasificacionFiscalLote"
        />
      </template>
    </Dialog>
  </AppLayout>
</template>

<style scoped>
/* ── Encabezado ── */
.control {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--superficie);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--radio-control);
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: #374151;
  font-family: inherit;
  cursor: pointer;
}
.control--picker {
  position: relative;
}
.control--boton:hover {
  background: var(--superficie-tenue);
}
.control__icono {
  font-size: 12.5px;
  color: var(--texto-tenue);
}
.control__chevron {
  font-size: 10px;
  color: var(--texto-debil);
}
.control__valor {
  white-space: nowrap;
}

/* El DatePicker sirve solo de disparador: su input cubre el chip pero no se ve. */
.picker-oculto {
  position: absolute;
  inset: 0;
}
.picker-oculto :deep(input) {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: transparent;
  cursor: pointer;
}

/* ── KPIs ── */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

/* ── Cabecera de la tabla ── */
.cabecera {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--borde-tenue);
}
.filtros {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.separador {
  flex: 1;
}
.buscador {
  flex: 1;
  min-width: 240px;
}
.buscador :deep(input) {
  width: 100%;
  background: #f7f8fa;
  border-color: var(--borde);
  border-radius: var(--radio-control);
  padding-top: 8px;
  padding-bottom: 8px;
  font-size: 12.5px;
}

.filtro {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--superficie);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--radio-control);
  padding: 8px 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--texto);
  cursor: pointer;
}
.filtro--activo {
  background: var(--teal-suave);
  border-color: var(--teal-borde);
  color: var(--teal);
}
.filtro__label {
  color: var(--texto-debil);
  font-weight: 500;
  white-space: nowrap;
}
.filtro__valor {
  white-space: nowrap;
}
.filtro__chevron {
  font-size: 9.5px;
  opacity: 0.55;
}
/* z-index por encima del DatePicker invisible (.picker-oculto, absolute
   inset:0) que cubre todo el chip — si no, el clic abre el calendario en vez
   de limpiar el filtro. */
.filtro__limpiar {
  position: relative;
  z-index: 1;
  font-size: 9.5px;
  color: var(--texto-debil);
  cursor: pointer;
}
.filtro__limpiar:hover {
  color: var(--error);
}
.filtro :deep(.p-select) {
  background: transparent;
  border: 0;
  box-shadow: none;
  min-width: 0;
  width: 118px;
}
.filtro--ancho :deep(.p-select) {
  width: 150px;
}
.filtro :deep(.p-select-label) {
  padding: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: inherit;
}
.filtro :deep(.p-select-dropdown) {
  width: auto;
  color: currentColor;
  opacity: 0.55;
}
.filtro :deep(.p-select-dropdown .p-icon) {
  width: 9.5px;
  height: 9.5px;
}

.mas-filtros {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px dashed #cfd4dc;
  background: transparent;
  border-radius: var(--radio-control);
  padding: 8px 11px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--texto-suave);
  cursor: pointer;
}
.mas-filtros i {
  font-size: 11.5px;
}
.mas-filtros__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
}
.mas-filtros__panel label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--texto-suave);
}

.peligro {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--error-borde);
  background: var(--error-fondo);
  border-radius: var(--radio-control);
  padding: 8px 11px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--error);
  cursor: pointer;
}
.peligro i {
  font-size: 11.5px;
}
.peligro:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Vistas rápidas ── */
.vistas {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.vistas__label {
  font-size: 11.5px;
  color: #98a0ac;
  font-weight: 600;
}
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radio-chip);
  padding: 4px 11px;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  background: var(--superficie);
  color: var(--texto-suave);
  border: 1px solid var(--borde-fuerte);
}
.chip__n {
  opacity: 0.6;
}
.chip__cerrar {
  font-size: 8.5px;
}
.chip--alerta {
  background: var(--alerta-fondo);
  color: var(--alerta);
  border-color: var(--alerta-borde);
}
.chip--error {
  background: var(--error-fondo);
  color: var(--error);
  border-color: var(--error-borde);
}
.chip--ok {
  background: var(--ok-fondo);
  color: var(--ok);
  border-color: var(--ok-borde);
}
.chip--activo {
  box-shadow: 0 0 0 2px rgba(22, 24, 29, 0.09);
  font-weight: 600;
}

/* ── Tabla ── */
.tabla :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}
.tabla :deep(.col-der) {
  text-align: right;
}
.tabla :deep(.p-paginator) {
  padding: 12px 16px;
  border-top: 1px solid var(--borde-tenue);
}
.tabla :deep(.p-paginator-content) {
  width: 100%;
  justify-content: flex-end;
  gap: 5px;
}
.tabla :deep(.p-paginator-current) {
  margin-right: auto;
  font-size: 12px;
  color: var(--texto-tenue);
}
.vacio {
  padding: 26px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--texto-tenue);
}
.comercio {
  display: flex;
  align-items: center;
  gap: 9px;
}
.comercio__nombre {
  font-weight: 600;
  color: var(--texto);
  min-width: 0;
}
.tenue {
  color: var(--texto-medio);
}
.suave {
  color: var(--texto-suave);
}
.nowrap {
  white-space: nowrap;
}
.ncf {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--texto);
}
.monto {
  font-weight: 600;
  color: var(--texto);
}
.acciones {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.accion {
  width: 27px;
  height: 27px;
  border-radius: 7px;
  border: 1px solid var(--borde);
  background: var(--superficie);
  display: grid;
  place-items: center;
  color: var(--texto-suave);
  cursor: pointer;
}
.accion i {
  font-size: 11px;
}
.accion:hover {
  background: var(--superficie-tenue);
}
.accion--peligro {
  border-color: var(--error-borde);
  background: var(--error-fondo);
  color: var(--error);
}

/* ── Bloques inferiores ── */
.inferior {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 14px;
  align-items: start;
}
.dropzone {
  border: 1.5px dashed #cbd5dc;
  border-radius: 11px;
  background: var(--superficie-tenue);
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  text-align: center;
  cursor: pointer;
}
.dropzone--activa {
  border-color: var(--teal);
  background: var(--teal-suave);
}
.dropzone__icono {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--teal-suave);
  display: grid;
  place-items: center;
}
.dropzone__icono i {
  font-size: 16px;
  color: var(--teal);
}
.dropzone__titulo {
  font-size: 13px;
  font-weight: 600;
}
.dropzone__pie {
  font-size: 11.5px;
  color: #98a0ac;
}
.dropzone__enlace {
  color: var(--teal);
  font-weight: 600;
}
.pendientes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pendiente {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--borde-tenue);
  border-radius: 10px;
}
.pendiente > i {
  font-size: 13px;
}
.pendiente__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}
.pendiente__archivo {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pendiente__detalle {
  font-size: 11px;
  color: #98a0ac;
}
.descartar {
  font-size: 11px;
  font-weight: 600;
  color: var(--texto-suave);
  border: 1px solid var(--borde-fuerte);
  background: var(--superficie);
  border-radius: 7px;
  padding: 4px 10px;
  font-family: inherit;
  cursor: pointer;
}
.sin-alertas {
  margin: 0;
  font-size: 12.5px;
  color: var(--texto-tenue);
}
.alerta {
  border: 1px solid var(--error-borde);
  background: var(--error-fondo);
  border-radius: 11px;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.alerta__cuerpo {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.alerta__cuerpo > i {
  font-size: 13px;
  color: var(--error);
  margin-top: 1px;
}
.alerta__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.alerta__titulo {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--texto);
}
.alerta__detalle {
  font-size: 11.5px;
  color: var(--texto-suave);
  line-height: 1.45;
}
.alerta__acciones {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 22px;
}
.alerta__accion {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--error);
  border: 0;
  border-radius: 7px;
  padding: 4px 10px;
  font-family: inherit;
  cursor: pointer;
}
.alerta__descartar {
  font-size: 11px;
  font-weight: 600;
  color: var(--texto-suave);
  border: 1px solid var(--borde-fuerte);
  background: var(--superficie);
  border-radius: 7px;
  padding: 4px 10px;
  font-family: inherit;
  cursor: pointer;
}

.accion-lote {
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: var(--radio-control);
  padding: 8px 11px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.accion-lote i {
  font-size: 11.5px;
}
.accion-lote:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.accion-lote--teal {
  border: 1px solid var(--teal-borde);
  background: var(--teal-suave);
  color: var(--teal);
}
.accion-lote--ok {
  border: 1px solid var(--ok-borde);
  background: var(--ok-fondo);
  color: var(--ok);
}

.aviso-fiscal {
  margin: 0;
  padding: 0.65rem 0.8rem;
  border-radius: 8px;
  background: var(--p-amber-50, #fffbeb);
  color: var(--p-amber-800, #92400e);
  font-size: 0.82rem;
  line-height: 1.45;
}

.pista-fiscal {
  display: block;
  margin-top: 0.35rem;
  color: var(--p-text-muted-color, #6b7280);
  font-size: 0.75rem;
  line-height: 1.4;
}

.dialogo-asignar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dialogo-asignar label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--texto-suave);
}
.w-full {
  width: 100%;
}
</style>
