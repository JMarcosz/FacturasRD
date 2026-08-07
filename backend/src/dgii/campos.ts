/**
 * Traducción de nombres de campo: los que usa el extractor (Gemini, ver
 * `FacturaExtraida` en types.ts) → las columnas del modelo `Factura`.
 *
 * Por qué existe: `Factura.confidences` guarda las claves crudas de Gemini
 * (`rncEmisor`, `montoGravado`, `fechaEmision`…) y `Validacion.campo` hereda
 * esas mismas claves cuando la validación es `BAJA_CONFIANZA`. El frontend, en
 * cambio, indexa todo por nombre de columna. Sin esta tabla no hay ni una
 * coincidencia y los badges de confianza no se renderizan nunca.
 *
 * Se aplica **en lectura** (al serializar la factura), así que las filas ya
 * guardadas siguen funcionando sin migrar datos. La traducción es idempotente:
 * un nombre que ya es de columna (o que no está en la tabla) se devuelve tal
 * cual.
 */

/** Nombre de Gemini → nombre de columna. Solo se listan los que cambian de nombre o se confirman. */
export const CAMPOS_GEMINI_A_COLUMNA: Readonly<Record<string, string>> = {
  rncEmisor: 'identificacionEmisor',
  nombreEmisor: 'nombreEmisor',
  rncReceptor: 'identificacionReceptor',
  nombreReceptor: 'nombreReceptor',
  ncf: 'ncf',
  ncfModificado: 'ncfModificado',
  fechaEmision: 'fechaComprobante',
  montoGravado: 'montoFacturado',
  itbis: 'itbisFacturado',
  isc: 'isc',
  propinaLegal: 'propinaLegal',
  otrosImpuestos: 'otrosImpuestos',
  formaPagoImpresa: 'formaPago',
};

/** Traduce un nombre de campo suelto (el de `Validacion.campo`, que es nullable). */
export function traducirCampo<T extends string | null | undefined>(campo: T): T {
  if (campo === null || campo === undefined) return campo;
  return (CAMPOS_GEMINI_A_COLUMNA[campo] ?? campo) as T;
}

/**
 * Traduce las claves de un mapa de confianzas (`Factura.confidences`, columna
 * `Json?`). Devuelve `null` cuando no hay confianzas, para no inventar un
 * objeto vacío donde la base tiene NULL.
 *
 * Si dos claves distintas colapsan en la misma columna gana la menor confianza:
 * es la lectura conservadora — el campo se marca como dudoso.
 */
export function traducirCampos(confidences: unknown): Record<string, number> | null {
  if (confidences === null || confidences === undefined || typeof confidences !== 'object') return null;

  const traducidas: Record<string, number> = {};
  for (const [campo, valor] of Object.entries(confidences as Record<string, unknown>)) {
    if (typeof valor !== 'number') continue;
    const columna = traducirCampo(campo);
    const previo = traducidas[columna];
    traducidas[columna] = previo === undefined ? valor : Math.min(previo, valor);
  }
  return traducidas;
}
