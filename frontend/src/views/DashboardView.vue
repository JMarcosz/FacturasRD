<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppLayout from '../components/AppLayout.vue';
import EncabezadoPantalla from '../components/ui/EncabezadoPantalla.vue';
import TarjetaPanel from '../components/ui/TarjetaPanel.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import AvatarIniciales from '../components/ui/AvatarIniciales.vue';
import { aYyyymm, obtenerResumen } from '../api/estadisticas';
import { diasParaDeclarar, fmtYyyymm, pct } from '../formato';
import { useAuthStore } from '../stores/auth';
import { useHiloConductor } from '../composables/useHiloConductor';
import type { EstadoPeriodo, Formato, ResumenEstadisticas } from '../types';

type Tono = 'ok' | 'alerta' | 'error' | 'info' | 'indigo' | 'neutro' | 'teal';

interface Etapa {
  n: string;
  titulo: string;
  valor: string;
  detalle: string;
  pct: number;
  color: string;
  fondo: string;
  borde: string;
}

interface FilaPeriodo {
  clave: string;
  clienteId: string;
  nombre: string;
  rnc: string;
  formato: Formato | null;
  formatoLabel: string;
  facturas: number;
  avance: number;
  estadoTexto: string;
  tono: Tono;
  periodoId: string | null;
}

interface Accion {
  titulo: string;
  detalle: string;
  icono: string;
  color: string;
  fondo: string;
  borde: string;
  ruta: string;
}

interface Bloqueo {
  codigo: string;
  titulo: string;
  detalle: string;
  facturas: number;
}

const router = useRouter();
const auth = useAuthStore();

const resumen = ref<ResumenEstadisticas | null>(null);
const cargando = ref(true);
const error = ref('');

// Mismo cálculo que la cinta persistente de AppLayout: el botón de la
// cabecera del embudo lleva al mismo "siguiente paso", nunca a uno distinto.
const { pasoActual } = useHiloConductor(resumen);

// El mes se fija al montar: si el usuario deja la pantalla abierta pasada la
// medianoche del día 1, los datos y el contador de días siguen coincidiendo.
const yyyymmLocal = ref(aYyyymm(new Date()));

/** El saludo del diseño usa solo el nombre de pila. */
const nombrePila = computed(() => (auth.usuario?.nombre ?? '').split(/\s+/).filter(Boolean)[0] ?? '');

const yyyymm = computed(() => resumen.value?.mes.yyyymm ?? yyyymmLocal.value);
const mesLegible = computed(() => fmtYyyymm(yyyymm.value));
const mesMinuscula = computed(() => mesLegible.value.toLowerCase());
const dias = computed(() => diasParaDeclarar(yyyymm.value));

const subtitulo = computed(() => {
  const base = `Cierre de ${mesMinuscula.value} · `;
  if (dias.value > 1) return `${base}quedan ${dias.value} días para presentar el 606 y 607.`;
  if (dias.value === 1) return `${base}queda 1 día para presentar el 606 y 607.`;
  if (dias.value === 0) return `${base}hoy vence el plazo para presentar el 606 y 607.`;
  return `${base}el plazo para presentar el 606 y 607 venció hace ${Math.abs(dias.value)} días.`;
});

const textoDias = computed(() => {
  if (dias.value > 1) return `${dias.value} días restantes`;
  if (dias.value === 1) return '1 día restante';
  if (dias.value === 0) return 'Vence hoy';
  return `Vencido hace ${Math.abs(dias.value)} días`;
});

const vacio = computed(() => !cargando.value && !error.value && (resumen.value?.mes.escaneadas ?? 0) === 0);

/** El embudo no está estrictamente anidado (`confirmarClasificacionLote` no exige cliente): el % se topa a 100. */
function avance(parte: number, total: number): number {
  return Math.min(100, pct(parte, total));
}

const FORMATOS: Record<Formato, string> = { F606: '606 · Compras', F607: '607 · Ventas' };

const filas = computed<FilaPeriodo[]>(() => {
  if (!resumen.value) return [];
  const salida: FilaPeriodo[] = [];
  for (const c of resumen.value.porCliente) {
    if (c.clienteId === null) continue; // grupo "sin clasificar": no es un período
    for (const f of c.porFormato) {
      const tono = tonoFila(f.conErrorValidacion, f.periodo?.estado ?? null, avance(f.confirmadas, f.escaneadas));
      salida.push({
        clave: `${c.clienteId}:${f.formato ?? 'sin'}`,
        clienteId: c.clienteId,
        nombre: c.nombre ?? '—',
        rnc: c.rnc ?? '—',
        formato: f.formato,
        formatoLabel: f.formato ? FORMATOS[f.formato] : 'Sin formato',
        facturas: f.escaneadas,
        avance: avance(f.confirmadas, f.escaneadas),
        estadoTexto: textoFila(f.conErrorValidacion, f.periodo?.estado ?? null, avance(f.confirmadas, f.escaneadas)),
        tono,
        periodoId: f.periodo?.id ?? null,
      });
    }
  }
  return salida.sort((a, b) => b.facturas - a.facturas);
});

function textoFila(errores: number, estado: EstadoPeriodo | null, avanceFila: number): string {
  if (errores > 0) return errores === 1 ? '1 error' : `${errores} errores`;
  if (!estado) return 'Sin período';
  if (estado === 'EXPORTADO') return 'Exportado';
  if (estado === 'REVISADO' || avanceFila === 100) return 'Listo para exportar';
  return avanceFila > 0 ? 'En revisión' : 'Abierto';
}

function tonoFila(errores: number, estado: EstadoPeriodo | null, avanceFila: number): Tono {
  if (errores > 0) return 'error';
  if (!estado) return 'neutro';
  if (estado === 'EXPORTADO') return 'indigo';
  if (estado === 'REVISADO' || avanceFila === 100) return 'ok';
  return avanceFila > 0 ? 'alerta' : 'neutro';
}

const COLOR_TONO: Record<Tono, string> = {
  ok: 'var(--ok)',
  alerta: 'var(--alerta)',
  error: 'var(--error)',
  info: 'var(--info)',
  indigo: 'var(--indigo)',
  teal: 'var(--teal)',
  neutro: 'var(--texto-suave)',
};

const filasVisibles = computed(() => filas.value.slice(0, 6));

const periodosExportados = computed(() => filas.value.filter((f) => f.estadoTexto === 'Exportado').length);
const periodosListos = computed(() => filas.value.filter((f) => f.estadoTexto === 'Listo para exportar').length);

const etapas = computed<Etapa[]>(() => {
  if (!resumen.value) return [];
  const m = resumen.value.mes;
  const cola = resumen.value.colaDocumentos.pendientes + resumen.value.colaDocumentos.procesando;
  const porConfirmar = Math.max(0, m.clasificadas - m.confirmadas);
  return [
    {
      n: '1',
      titulo: 'Escaneadas',
      valor: String(m.escaneadas),
      detalle: cola > 0 ? `${cola} ${cola === 1 ? 'documento aún' : 'documentos aún'} en proceso` : 'todos los documentos procesados',
      pct: m.escaneadas > 0 ? 100 : 0,
      color: '#0f766e',
      fondo: '#f0fdfa',
      borde: '#ccfbf1',
    },
    {
      n: '2',
      titulo: 'Clasificadas',
      valor: String(m.clasificadas),
      detalle: m.sinClasificar > 0 ? `${m.sinClasificar} sin formato 606/607` : 'todas con formato asignado',
      pct: avance(m.clasificadas, m.escaneadas),
      color: '#0891b2',
      fondo: '#ecfeff',
      borde: '#cffafe',
    },
    {
      n: '3',
      titulo: 'Confirmadas',
      valor: String(m.confirmadas),
      detalle: porConfirmar > 0 ? `${porConfirmar} pendientes de confirmar` : 'todo confirmado',
      pct: avance(m.confirmadas, m.clasificadas),
      color: '#b54708',
      fondo: '#fffaeb',
      borde: '#fedf89',
    },
    {
      n: '4',
      titulo: 'Exportadas',
      valor: String(m.exportadas),
      detalle: filas.value.length
        ? `${periodosExportados.value} de ${filas.value.length} períodos con TXT generado`
        : 'sin períodos abiertos',
      pct: avance(m.exportadas, m.escaneadas),
      color: '#4338ca',
      fondo: '#eef2ff',
      borde: '#e0e7ff',
    },
  ];
});

const acciones = computed<Accion[]>(() => {
  const sinClasificar = resumen.value?.mes.sinClasificar ?? 0;
  return [
    {
      titulo: 'Subir facturas',
      detalle: 'PDF o foto, en lote',
      icono: 'pi-cloud-upload',
      color: 'var(--teal)',
      fondo: '#f0fdfa',
      borde: '#ccfbf1',
      ruta: 'facturas',
    },
    {
      titulo: sinClasificar > 0 ? `Clasificar ${sinClasificar}` : 'Clasificar',
      detalle: 'Asignar 606 o 607',
      icono: 'pi-tags',
      color: 'var(--alerta)',
      fondo: 'var(--alerta-fondo)',
      borde: 'var(--alerta-borde)',
      ruta: 'facturas',
    },
    {
      titulo: 'Generar TXT',
      detalle: periodosListos.value === 1 ? '1 período listo' : `${periodosListos.value} períodos listos`,
      icono: 'pi-file-export',
      color: 'var(--indigo)',
      fondo: 'var(--indigo-fondo)',
      borde: '#e0e7ff',
      ruta: 'reporteria',
    },
    {
      titulo: 'Nuevo cliente',
      detalle: 'Configuración fiscal',
      icono: 'pi-user-plus',
      color: 'var(--info)',
      fondo: 'var(--info-fondo)',
      borde: 'var(--info-borde)',
      ruta: 'clientes',
    },
  ];
});

const TITULOS_ERROR: Record<string, string> = {
  IDENTIFICACION_FALTANTE: 'RNC/Cédula sin detectar',
  RNC_INVALIDO: 'RNC inválido',
  CEDULA_INVALIDA: 'Cédula inválida',
  NCF_FORMATO: 'NCF con formato inválido',
  NCF_TIPO_NO_PERMITIDO: 'Tipo de NCF fuera del catálogo',
  NCF_DUPLICADO: 'NCF duplicado',
  NC_SIN_MODIFICADO: 'Nota de crédito sin NCF modificado',
  FECHA_COMPROBANTE_FALTANTE: 'Fecha del comprobante vacía',
  FECHA_FUERA_PERIODO: 'Fecha fuera del período',
  CLASIFICACION_FALTANTE: 'Clasificación DGII incompleta',
  FORMA_VENTA_INDEFINIDA: 'Forma de venta sin distribuir',
  DESCUADRE_606: 'Servicios + bienes no cuadra',
  DESCUADRE_607: 'Formas de venta no cuadran',
  FECHA_PAGO_ANTERIOR: 'Fecha de pago anterior al comprobante',
  BAJA_CONFIANZA: 'Extracción de baja confianza',
};

const bloqueos = computed<Bloqueo[]>(() =>
  (resumen.value?.erroresBloqueantes ?? []).slice(0, 5).map((e) => ({
    codigo: e.codigo,
    // Si aparece un código nuevo del backend se muestra crudo antes que "—".
    titulo: TITULOS_ERROR[e.codigo] ?? e.codigo,
    detalle: `${e.cantidad} ${e.cantidad === 1 ? 'validación' : 'validaciones'} · ${e.codigo}`,
    // El backend agrupa por código y devuelve filas de Validacion, no facturas
    // distintas: una factura con dos errores del mismo código cuenta dos veces.
    facturas: e.cantidad,
  })),
);

function abrirFila(fila: FilaPeriodo) {
  if (fila.clienteId) router.push({ name: 'facturas', query: { clienteId: fila.clienteId } });
}

function irA(ruta: string) {
  router.push({ name: ruta });
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    resumen.value = await obtenerResumen(yyyymmLocal.value);
  } catch {
    error.value = 'No se pudo cargar el resumen del mes.';
    resumen.value = null;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <div class="dashboard">
      <EncabezadoPantalla :titulo="`Hola de nuevo, ${nombrePila}`" :subtitulo="subtitulo" />

      <TarjetaPanel v-if="cargando" class="aviso">Cargando el resumen del mes…</TarjetaPanel>

      <TarjetaPanel v-else-if="error" class="aviso">
        <div class="aviso__error">
          <i class="pi pi-exclamation-circle"></i>
          <span>{{ error }}</span>
          <button type="button" class="enlace" @click="cargar()">Reintentar</button>
        </div>
      </TarjetaPanel>

      <TarjetaPanel v-else-if="vacio">
        <div class="vacio">
          <div class="vacio__icono"><i class="pi pi-inbox"></i></div>
          <span class="vacio__titulo">Aún no hay facturas de {{ mesMinuscula }}</span>
          <span class="vacio__texto">
            Sube los PDF o las fotos del mes y aquí verás el avance del cierre: escaneo, clasificación, revisión y
            exportación.
          </span>
          <button type="button" class="vacio__accion" @click="irA('facturas')">
            <i class="pi pi-cloud-upload"></i>Subir facturas
          </button>
        </div>
      </TarjetaPanel>

      <template v-else>
        <TarjetaPanel
          :titulo="`Cierre de ${mesMinuscula}`"
          subtitulo="El período avanza cuando cada cliente pasa por escaneo, clasificación, revisión y exportación."
        >
          <template #cabecera>
            <span class="chip-plazo" :class="{ 'chip-plazo--vencido': dias < 0 }">{{ textoDias }}</span>
            <button
              v-if="pasoActual"
              type="button"
              class="boton-siguiente-paso"
              @click="$router.push(pasoActual.ruta)"
            >
              {{ pasoActual.pendiente ? `Ir a ${pasoActual.label.toLowerCase()}` : 'Descargar reportes' }}
              <i class="pi pi-arrow-right" style="font-size: 10px"></i>
            </button>
          </template>

          <div class="etapas">
            <div
              v-for="e in etapas"
              :key="e.n"
              class="etapa"
              :style="{ background: e.fondo, borderColor: e.borde }"
            >
              <div class="etapa__cabecera">
                <div class="etapa__n" :style="{ background: e.color }">{{ e.n }}</div>
                <span class="etapa__titulo">{{ e.titulo }}</span>
              </div>
              <div class="etapa__valor">{{ e.valor }}</div>
              <span class="etapa__detalle">{{ e.detalle }}</span>
              <div class="etapa__barra">
                <div class="etapa__relleno" :style="{ width: `${e.pct}%`, background: e.color }"></div>
              </div>
            </div>
          </div>
        </TarjetaPanel>

        <div class="columnas">
          <TarjetaPanel titulo="Períodos por cliente" sin-padding>
            <template #cabecera>
              <button type="button" class="enlace" @click="irA('reporteria')">Ver todos</button>
            </template>

            <div class="tabla-scroll">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Formato</th>
                  <th class="tabla--der">Facturas</th>
                  <th>Avance</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="fila in filasVisibles"
                  :key="fila.clave"
                  :class="{ 'tabla__fila--clicable': fila.periodoId }"
                  @click="abrirFila(fila)"
                >
                  <td>
                    <div class="cliente">
                      <AvatarIniciales :nombre="fila.nombre" :tamano="25" />
                      <div class="cliente__texto">
                        <span class="cliente__nombre">{{ fila.nombre }}</span>
                        <span class="cliente__rnc">RNC {{ fila.rnc }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="tabla__formato">{{ fila.formatoLabel }}</td>
                  <td class="tabla--der tabla__facturas">{{ fila.facturas }}</td>
                  <td>
                    <div class="avance">
                      <div class="avance__barra">
                        <div
                          class="avance__relleno"
                          :style="{ width: `${fila.avance}%`, background: COLOR_TONO[fila.tono] }"
                        ></div>
                      </div>
                      <span class="avance__pct">{{ fila.avance }}%</span>
                    </div>
                  </td>
                  <td><Pastilla :texto="fila.estadoTexto" :tono="fila.tono" /></td>
                </tr>
                <tr v-if="!filasVisibles.length">
                  <td colspan="5" class="tabla__sinfilas">Ninguna factura del mes está asignada a un cliente.</td>
                </tr>
              </tbody>
            </table>
            </div>
          </TarjetaPanel>

          <div class="lateral">
            <TarjetaPanel titulo="Acciones rápidas">
              <div class="acciones">
                <button
                  v-for="a in acciones"
                  :key="a.titulo"
                  type="button"
                  class="accion"
                  :style="{ background: a.fondo, borderColor: a.borde }"
                  @click="irA(a.ruta)"
                >
                  <span class="accion__icono"><i class="pi" :class="a.icono" :style="{ color: a.color }"></i></span>
                  <span class="accion__titulo">{{ a.titulo }}</span>
                  <span class="accion__detalle">{{ a.detalle }}</span>
                </button>
              </div>
            </TarjetaPanel>

            <TarjetaPanel titulo="Bloqueos para exportar">
              <button
                v-for="b in bloqueos"
                :key="b.codigo"
                type="button"
                class="bloqueo"
                @click="irA('reporteria')"
              >
                <span class="bloqueo__n">{{ b.facturas }}</span>
                <span class="bloqueo__texto">
                  <span class="bloqueo__titulo">{{ b.titulo }}</span>
                  <span class="bloqueo__detalle">{{ b.detalle }}</span>
                </span>
                <i class="pi pi-angle-right bloqueo__chevron"></i>
              </button>
              <span v-if="!bloqueos.length" class="bloqueo__vacio">Nada bloquea la exportación de este mes.</span>
            </TarjetaPanel>
          </div>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Cierre del mes ── */
.chip-plazo {
  font-size: 12px;
  font-weight: 700;
  color: var(--alerta);
  background: var(--alerta-fondo);
  border: 1px solid var(--alerta-borde);
  border-radius: var(--radio-chip);
  padding: 5px 12px;
  white-space: nowrap;
}
.chip-plazo--vencido {
  color: var(--error);
  background: var(--error-fondo);
  border-color: var(--error-borde);
}
.boton-siguiente-paso {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  padding: 7px 13px;
  background: var(--teal);
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.boton-siguiente-paso:hover {
  background: var(--teal-oscuro);
}

.etapas {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.etapa {
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.etapa__cabecera {
  display: flex;
  align-items: center;
  gap: 8px;
}
.etapa__n {
  width: 22px;
  height: 22px;
  border-radius: var(--radio-chip);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  flex: none;
}
.etapa__titulo {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--texto);
}
.etapa__valor {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.8px;
  line-height: 1;
}
.etapa__detalle {
  font-size: 11.5px;
  color: var(--texto-suave);
}
.etapa__barra {
  height: 5px;
  border-radius: var(--radio-chip);
  background: rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.etapa__relleno {
  height: 100%;
  border-radius: var(--radio-chip);
}

/* ── Rejilla inferior ── */
.columnas {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 14px;
  align-items: start;
}
.lateral {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

/* ── Tabla de períodos ── */
.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.tabla thead tr {
  background: var(--superficie-tenue);
}
.tabla th {
  text-align: left;
  padding: 9px 16px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--texto-debil);
  font-weight: 700;
  border-bottom: 1px solid var(--borde-tenue);
}
.tabla td {
  padding: 11px 16px;
  border-bottom: 1px solid #f2f4f6;
}
.tabla tbody tr:last-child td {
  border-bottom: 0;
}
.tabla--der {
  text-align: right;
}
.tabla__fila--clicable {
  cursor: pointer;
}
.tabla__fila--clicable:hover {
  background: var(--superficie-tenue);
}
.tabla__formato {
  color: var(--texto-medio);
}
.tabla__facturas {
  font-weight: 600;
}
.tabla__sinfilas {
  text-align: center;
  color: var(--texto-tenue);
  font-size: 12px;
  padding: 22px 16px;
}
.cliente {
  display: flex;
  align-items: center;
  gap: 9px;
}
.cliente__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.cliente__nombre {
  font-weight: 600;
}
.cliente__rnc {
  font-size: 10.5px;
  color: var(--texto-debil);
}
.avance {
  display: flex;
  align-items: center;
  gap: 8px;
}
.avance__barra {
  width: 78px;
  height: 6px;
  border-radius: var(--radio-chip);
  background: #f0f2f4;
  overflow: hidden;
  flex: none;
}
.avance__relleno {
  height: 100%;
  border-radius: var(--radio-chip);
}
.avance__pct {
  font-size: 11px;
  color: var(--texto-tenue);
  font-weight: 600;
}

/* ── Acciones rápidas ── */
.acciones {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.accion {
  border: 1px solid transparent;
  border-radius: 11px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.accion:hover {
  filter: brightness(0.98);
}
.accion__icono {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--superficie);
  display: grid;
  place-items: center;
}
.accion__icono i {
  font-size: 12px;
}
.accion__titulo {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--texto);
}
.accion__detalle {
  font-size: 11px;
  color: var(--texto-suave);
  line-height: 1.4;
}

/* ── Bloqueos ── */
.bloqueo {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--borde-tenue);
  border-radius: 10px;
  background: var(--superficie);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.bloqueo:hover {
  background: var(--superficie-tenue);
}
.bloqueo__n {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  background: var(--error-fondo);
  color: var(--error);
  flex: none;
}
.bloqueo__texto {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}
.bloqueo__titulo {
  font-size: 12px;
  font-weight: 600;
  color: var(--texto);
}
.bloqueo__detalle {
  font-size: 10.5px;
  color: var(--texto-debil);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bloqueo__chevron {
  font-size: 12px;
  color: #c3c9d2;
}
.bloqueo__vacio {
  font-size: 12px;
  color: var(--texto-tenue);
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
.vacio__accion {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: var(--radio-control);
  background: var(--teal);
  color: #fff;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  padding: 9px 15px;
  cursor: pointer;
}
.vacio__accion:hover {
  background: var(--teal-oscuro);
}
.vacio__accion i {
  font-size: 12px;
}

@media (max-width: 1024px) {
  .columnas {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .etapas {
    grid-template-columns: repeat(2, 1fr);
  }
  .etapa {
    padding: 12px;
    gap: 7px;
  }
  .etapa__valor {
    font-size: 20px;
  }
  .etapa__titulo {
    font-size: 11.5px;
  }
  .etapa__detalle {
    font-size: 10.5px;
  }
  .etapa__n {
    width: 20px;
    height: 20px;
    font-size: 9px;
  }
  .columnas {
    gap: 12px;
  }
  .bloqueo {
    padding: 8px 10px;
    gap: 8px;
  }
  .bloqueo__n {
    width: 22px;
    height: 22px;
    font-size: 10px;
    border-radius: 6px;
  }
  .bloqueo__titulo {
    font-size: 11.5px;
  }
  .bloqueo__detalle {
    font-size: 10px;
  }
  .accion__icono {
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }
  .accion__icono i {
    font-size: 11px;
  }
  .accion__titulo {
    font-size: 12px;
  }
  .accion__detalle {
    font-size: 10.5px;
  }
}

@media (max-width: 480px) {
  .etapas,
  .acciones {
    grid-template-columns: 1fr;
  }
  .dashboard {
    gap: 12px;
  }
  .etapa {
    padding: 10px;
  }
  .etapa__valor {
    font-size: 18px;
  }
  .etapa__n {
    width: 18px;
    height: 18px;
    font-size: 8.5px;
  }
  .etapas {
    gap: 8px;
  }
  .accion {
    padding: 10px;
  }
  .accion__titulo {
    font-size: 11.5px;
  }
  .accion__detalle {
    font-size: 10px;
  }
  .accion__icono {
    width: 20px;
    height: 20px;
    border-radius: 5px;
  }
  .accion__icono i {
    font-size: 10px;
  }
  .acciones {
    gap: 8px;
  }
  .columnas {
    gap: 10px;
  }
  .bloqueo {
    padding: 7px 9px;
    gap: 7px;
  }
  .bloqueo__n {
    width: 20px;
    height: 20px;
    font-size: 9px;
  }
  .bloqueo__titulo {
    font-size: 11px;
  }
  .vacio__icono {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 16px;
  }
  .vacio__titulo {
    font-size: 14px;
  }
  .vacio__texto {
    font-size: 11.5px;
  }
  .vacio__accion {
    font-size: 11.5px;
    padding: 7px 12px;
  }
  .vacio__accion i {
    font-size: 11px;
  }
  .enlace {
    font-size: 10.5px;
  }
}
</style>
