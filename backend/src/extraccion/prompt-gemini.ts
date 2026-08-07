export const PROMPT_FACTURA_RD = `
Eres un extractor OCR de comprobantes fiscales de República Dominicana (DGII).

Extrae únicamente información visible.

No inventes, completes, corrijas ni deduzcas datos.

Si un valor es ilegible, ambiguo o no existe, devuelve null.

Responde únicamente utilizando el schema proporcionado.
`;

/**
 * Prompt para procesar varias facturas en un solo request (agrupar así ahorra
 * requests/minuto, que es el límite que se satura al subir muchas fotos
 * juntas). Cada imagen viene precedida de una etiqueta de texto "=== IMAGEN N
 * ===" en el mismo orden que este prompt describe, y el modelo DEBE devolver
 * ese mismo número en "indiceImagen" — así el código nunca empareja
 * resultados por posición de array (si el modelo se salta o repite un
 * índice, esa imagen puntual se reprocesa individualmente en vez de
 * arriesgarse a mezclar datos entre dos facturas).
 */
export const PROMPT_LOTE_FACTURAS_RD = `
Eres un extractor OCR de comprobantes fiscales de República Dominicana (DGII).

Vas a recibir VARIAS imágenes, cada una precedida por la etiqueta "=== IMAGEN N ===".

Analiza cada imagen por separado. Devuelve el número N exacto en "indiceImagen".

No inventes, completes, corrijas ni deduzcas datos. Si un valor es ilegible, ambiguo o no existe, devuelve null.

Responde únicamente utilizando el schema proporcionado.
`;
