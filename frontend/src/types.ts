export type Formato = 'F606' | 'F607';
export type ClasificacionOperacion = 'INGRESO' | 'COSTO' | 'GASTO' | 'PENDIENTE' | 'CLASIFICACION_AMBIGUA';
export type EstadoSugerencia = 'SUGERIDO' | 'CREADO' | 'DESCARTADO';
export type RolFactura = 'EMISOR' | 'RECEPTOR';
export type EstadoPeriodo = 'ABIERTO' | 'REVISADO' | 'EXPORTADO';
export type EstadoDocumento = 'PENDIENTE' | 'PROCESANDO' | 'EXTRAIDO' | 'ERROR';
export type Severidad = 'ERROR' | 'WARNING';
export type OrigenFactura = 'IA' | 'MANUAL' | 'EDITADA';

export interface SugerenciaCliente {
  id: string;
  rnc: string | null;
  nombre: string;
  rol: RolFactura;
  estado: EstadoSugerencia;
  vecesDetectado: number;
  ultimaFacturaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'ADMIN' | 'CONTADOR';
}

export interface Cliente {
  id: string;
  rnc: string;
  nombre: string;
  tipoIngresoDefault: string | null;
  tasaItbis: string;
  aplicaProporcionalidad: boolean;
  activo: boolean;
  origen: 'MANUAL' | 'AUTO';
  confirmado: boolean;
  rncVerificado: boolean;
}

export interface Periodo {
  id: string;
  clienteId: string;
  yyyymm: string;
  formato: Formato;
  estado: EstadoPeriodo;
  cliente?: { id: string; nombre: string; rnc: string };
  _count?: { documentos: number; facturas: number };
}

export interface Documento {
  id: string;
  filename: string;
  mimeType: string;
  paginas: number | null;
  estado: EstadoDocumento;
  intentos: number;
  error: string | null;
  createdAt: string;
  _count?: { facturas: number };
}

export interface Validacion {
  id: string;
  codigo: string;
  severidad: Severidad;
  campo: string | null;
  mensaje: string;
}

export interface LineaFactura {
  id: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  importe: string;
}

export interface Factura {
  id: string;
  documentoId: string;
  periodoId: string | null;
  clienteId: string | null;
  formato: Formato | null;
  clasificacionOperacion?: ClasificacionOperacion;
  justificacionIa?: string | null;
  confianzaIa?: number | null;
  tipoNcfCodigo?: string | null;
  cliente?: { id: string; nombre: string; rnc: string } | null;
  tipoIdentificacion: string;
  nombreEmisor: string | null;
  identificacionEmisor: string | null;
  nombreReceptor: string | null;
  identificacionReceptor: string | null;
  ncf: string;
  // Solo lo calcula y devuelve el endpoint de lista (GET /facturas) — no viene en findOne().
  tipoNcf?: { codigo: string; descripcion: string } | null;
  ncfModificado: string | null;
  fechaComprobante: string | null;
  fechaRetencionOPago: string | null;
  tipoIngreso: string | null;
  tipoBienesServicios: string | null;
  formaPago: string | null;
  tipoRetencionISR: string | null;
  montoFacturado: string;
  itbisFacturado: string;
  itbisRetenido: string;
  itbisPercibido: string;
  retencionRenta: string;
  isrPercibido: string;
  isc: string;
  otrosImpuestos: string;
  propinaLegal: string;
  montoServicios: string | null;
  montoBienes: string | null;
  itbisSujetoProporcionalidad: string | null;
  itbisLlevadoCosto: string | null;
  itbisPorAdelantar: string | null;
  montoEfectivo: string | null;
  montoChequeTransferencia: string | null;
  montoTarjeta: string | null;
  montoVentaCredito: string | null;
  montoBonos: string | null;
  montoPermuta: string | null;
  montoOtrasFormas: string | null;
  confidences: Record<string, number> | null;
  revisada: boolean;
  clasificacionConfirmada: boolean;
  origen: OrigenFactura;
  validaciones: Validacion[];
  lineas: LineaFactura[];
  documento?: { id: string; filename: string; mimeType: string; estado?: EstadoDocumento; paginas?: number | null };
}

export interface EstadoExportable {
  puedeExportar: boolean;
  totalFacturas: number;
  errores: Array<{ facturaId: string; codigo: string; mensaje: string }>;
  advertencias: number;
  sinConfirmar: number;
}

export interface Exportacion {
  id: string;
  tipo: 'TXT' | 'EXCEL';
  cantidadRegistros: number;
  createdAt: string;
}

export interface GrupoDuplicado {
  rncs: string[];
  nombre: string;
  ids: string[];
}

export interface ResultadoImportacion {
  procesados: number;
  total: number;
  fallidos: Array<{ rnc: string; motivo: string }>;
}

export interface ResultadoReclasificacion {
  reclasificadas: number;
  total: number;
  fallidas: Array<{ id: string; motivo: string }>;
}

export interface ReglaComercio {
  id: string;
  rnc: string;
  nombre: string;
  clienteId: string | null;
  formato: Formato | null;
  tipoIngreso: string | null;
  formaVenta: string | null;
  tipoBienesServicios: string | null;
  formaPago: string | null;
  vecesAplicada: number;
  activo: boolean;
}

export interface CampoModeloDiagnostico {
  nombre: string;
  valor: string | null;
  confidence: number | null;
}

export interface Diagnostico {
  documentoId: string;
  filename: string;
  estado: EstadoDocumento;
  error: string | null;
  ocrTexto: string;
  camposModelo: CampoModeloDiagnostico[];
  factura: Factura | null;
}

// ─── Estadísticas ────────────────────────────────────────────────────────────
// El backend devuelve SIEMPRE conteos crudos: los porcentajes y los deltas
// ("+12.4% vs. junio") se calculan aquí, que es donde se puede decidir qué
// mostrar cuando el denominador es 0.

export interface TotalesMes {
  yyyymm: string;
  escaneadas: number;
  clasificadas: number;
  sinClasificar: number;
  confirmadas: number;
  exportadas: number;
  conErrorValidacion: number;
  montoFacturado: string;
  itbisFacturado: string;
}

export interface RollupFormato {
  formato: Formato | null;
  escaneadas: number;
  confirmadas: number;
  conErrorValidacion: number;
  montoFacturado: string;
  itbisFacturado: string;
  periodo: { id: string; estado: EstadoPeriodo } | null;
}

export interface RollupCliente {
  clienteId: string | null; // null = grupo "sin clasificar"
  nombre: string | null;
  rnc: string | null;
  escaneadas: number;
  confirmadas: number;
  conErrorValidacion: number;
  montoFacturado: string;
  itbisFacturado: string;
  porFormato: RollupFormato[];
}

export interface ErrorPorCodigo {
  codigo: string;
  cantidad: number; // filas Validacion con ese código
}

export interface ColaDocumentos {
  pendientes: number;
  procesando: number;
  error: number;
  total: number;
}

export interface ResumenEstadisticas {
  mes: TotalesMes;
  mesAnterior: TotalesMes;
  porCliente: RollupCliente[];
  erroresBloqueantes: ErrorPorCodigo[];
  colaDocumentos: ColaDocumentos;
  sinFecha: number; // facturas sin fechaComprobante — no caen en ningún mes
}

/**
 * Totales del conjunto que la tabla de Facturas está mostrando ahora mismo.
 * El backend los anida bajo `totales`; el cliente de API los aplana para que
 * las pantallas lean `stats.escaneadas` sin un nivel intermedio.
 */
export interface EstadisticasFacturas extends Omit<TotalesMes, 'yyyymm'> {
  erroresBloqueantes: ErrorPorCodigo[];
}

// ─── Operaciones en lote ─────────────────────────────────────────────────────
/** Las operaciones en lote nunca abortan entero: reportan fallos por fila. */
export interface ResultadoLote {
  solicitadas: number;
  procesadas: number;
  fallidas: Array<{ id: string; motivo: string }>;
}

// ─── Catálogos DGII ──────────────────────────────────────────────────────────
export interface EntradaCatalogo {
  codigo: string;
  descripcion: string;
}

export interface CatalogosDgii {
  tiposIdentificacion: EntradaCatalogo[];
  tiposIngreso607: EntradaCatalogo[];
  tiposBienesServicios606: EntradaCatalogo[];
  formasPago606: EntradaCatalogo[];
  tiposNcf: EntradaCatalogo[];
}

// ─── Historial global de exportaciones ───────────────────────────────────────
export interface ExportacionGlobal {
  id: string;
  tipo: 'TXT' | 'EXCEL';
  cantidadRegistros: number;
  sha256: string;
  createdAt: string;
  periodo: {
    id: string;
    yyyymm: string;
    formato: Formato;
    estado: EstadoPeriodo;
    cliente: { id: string; nombre: string; rnc: string };
  };
}
