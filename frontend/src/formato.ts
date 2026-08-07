/** Helpers de formato compartidos por todas las pantallas. */

export function fmtMonto(valor: string | number | null | undefined): string {
  return Number(valor ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "RD$ 486K" para los KPIs — las cifras grandes no caben completas en la tarjeta. */
export function fmtMontoCorto(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (Math.abs(n) >= 1_000_000) return `RD$ ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `RD$ ${Math.round(n / 1_000)}K`;
  return `RD$ ${fmtMonto(n)}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "14 jul 2026" — el formato de la tabla del diseño. */
export function fmtFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MESES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

/** "Julio 2026" a partir de "202607". */
export function fmtYyyymm(yyyymm: string): string {
  const mes = Number(yyyymm.slice(4, 6));
  if (!mes || mes < 1 || mes > 12) return yyyymm;
  const nombre = MESES[mes - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${yyyymm.slice(0, 4)}`;
}

export function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Días que quedan para presentar el 606/607 de un mes: la DGII vence el día 20
 * del mes siguiente. Negativo = ya venció.
 */
export function diasParaDeclarar(yyyymm: string, hoy = new Date()): number {
  const anio = Number(yyyymm.slice(0, 4));
  const mes = Number(yyyymm.slice(4, 6));
  const limite = Date.UTC(anio, mes, 20); // mes es 1-based → Date.UTC lo toma como el mes siguiente
  const ahora = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.round((limite - ahora) / 86_400_000);
}

export function pct(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}
