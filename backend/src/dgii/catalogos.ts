/** Catálogos oficiales de la DGII usados en los Formatos de Envío de Datos 606 y 607. */

export interface EntradaCatalogo {
  codigo: string;
  descripcion: string;
}

export const TIPOS_IDENTIFICACION: readonly EntradaCatalogo[] = [
  { codigo: '1', descripcion: 'RNC' },
  { codigo: '2', descripcion: 'Cédula' },
  { codigo: '3', descripcion: 'Pasaporte' },
] as const;

/** Tipo de Ingreso — Formato 607 (Ventas). */
export const TIPOS_INGRESO_607: readonly EntradaCatalogo[] = [
  {
    codigo: '01',
    descripcion: 'Ingresos por operaciones (normales de su actividad)',
  },
  { codigo: '02', descripcion: 'Ingresos financieros' },
  { codigo: '03', descripcion: 'Ingresos extraordinarios' },
  { codigo: '04', descripcion: 'Ingresos por arrendamientos' },
  { codigo: '05', descripcion: 'Ingresos por venta de activo depreciable' },
  { codigo: '06', descripcion: 'Otros ingresos' },
] as const;

/** Tipo de Bienes y Servicios Comprados — Formato 606 (Compras y Gastos). */
export const TIPOS_BIENES_SERVICIOS_606: readonly EntradaCatalogo[] = [
  { codigo: '01', descripcion: 'Gastos de personal' },
  { codigo: '02', descripcion: 'Gastos por trabajos, suministros y servicios' },
  { codigo: '03', descripcion: 'Arrendamientos' },
  { codigo: '04', descripcion: 'Gastos de activos fijos' },
  { codigo: '05', descripcion: 'Gastos de representación' },
  { codigo: '06', descripcion: 'Otras deducciones admitidas' },
  { codigo: '07', descripcion: 'Gastos financieros' },
  { codigo: '08', descripcion: 'Gastos extraordinarios' },
  { codigo: '09', descripcion: 'Costo de venta y/o de producción' },
  { codigo: '10', descripcion: 'Adquisiciones de activos' },
  { codigo: '11', descripcion: 'Seguros' },
] as const;

/** Forma de Pago — Formato 606. */
export const FORMAS_PAGO_606: readonly EntradaCatalogo[] = [
  { codigo: '01', descripcion: 'Efectivo' },
  { codigo: '02', descripcion: 'Cheque / Transferencia / Depósito' },
  { codigo: '03', descripcion: 'Tarjeta Crédito / Débito' },
  { codigo: '04', descripcion: 'Compra a Crédito' },
  { codigo: '05', descripcion: 'Permuta' },
  { codigo: '06', descripcion: 'Nota de Crédito' },
  { codigo: '07', descripcion: 'Mixto' },
] as const;

/**
 * Tipo de comprobante según los 2 dígitos que siguen a la letra del NCF.
 * 01-17 son del NCF de papel (Norma 06-2018); 31-47 son su equivalente e-CF
 * (Ley 32-23) — hoy la inmensa mayoría de las facturas reales son e-CF, así
 * que dejarlos fuera hacía que "Tipo de NCF" saliera "no reconocido" para
 * casi todo, y que la validación bloqueara el TXT con un NCF_TIPO_NO_PERMITIDO
 * completamente falso.
 */
export const TIPOS_NCF: readonly EntradaCatalogo[] = [
  // --- NCF Tradicionales ---
  { codigo: '01', descripcion: 'Crédito Fiscal' },
  { codigo: '02', descripcion: 'Consumo' },
  { codigo: '03', descripcion: 'Nota de Débito' },
  { codigo: '04', descripcion: 'Nota de Crédito' },
  { codigo: '11', descripcion: 'Compras' },
  { codigo: '12', descripcion: 'Registro Único de Ingresos' },
  { codigo: '13', descripcion: 'Gastos Menores' },
  { codigo: '14', descripcion: 'Regímenes Especiales' },
  { codigo: '15', descripcion: 'Gubernamental' },
  { codigo: '16', descripcion: 'Exportaciones' },
  { codigo: '17', descripcion: 'Pagos al Exterior' },

  // --- e-NCF Electrónicos ---
  { codigo: '31', descripcion: 'Factura de Crédito Fiscal Electrónica' },
  { codigo: '32', descripcion: 'Factura de Consumo Electrónica' },
  { codigo: '33', descripcion: 'Nota de Débito Electrónica' },
  { codigo: '34', descripcion: 'Nota de Crédito Electrónica' },
  { codigo: '41', descripcion: 'Compras Electrónicas' },
  { codigo: '43', descripcion: 'Gastos Menores Electrónico' },
  { codigo: '44', descripcion: 'Regímenes Especiales Electrónico' },
  { codigo: '45', descripcion: 'Gubernamental Electrónico' },
  { codigo: '46', descripcion: 'Exportaciones Electrónicas' },
  { codigo: '47', descripcion: 'Pagos al Exterior Electrónico' },
] as const;

/** Tipos de NCF que representan notas de crédito y por tanto exigen "NCF Modificado". */
export const TIPOS_NCF_NOTA_CREDITO: ReadonlySet<string> = new Set([
  '04',
  '34',
]);

function buscar(
  catalogo: readonly EntradaCatalogo[],
  codigo: string,
): EntradaCatalogo | undefined {
  return catalogo.find((e) => e.codigo === codigo);
}

export function esTipoIngresoValido(codigo: string): boolean {
  return buscar(TIPOS_INGRESO_607, codigo) !== undefined;
}

export function esTipoBienesServiciosValido(codigo: string): boolean {
  return buscar(TIPOS_BIENES_SERVICIOS_606, codigo) !== undefined;
}

export function esFormaPagoValida(codigo: string): boolean {
  return buscar(FORMAS_PAGO_606, codigo) !== undefined;
}

export function esTipoNcfValido(codigo: string): boolean {
  return buscar(TIPOS_NCF, codigo) !== undefined;
}
