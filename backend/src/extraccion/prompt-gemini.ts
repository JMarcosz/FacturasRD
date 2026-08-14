import { PROMPT_OCR_CORTO } from './prompts/prompts';

export const PROMPT_FACTURA_RD = PROMPT_OCR_CORTO;

export const PROMPT_LOTE_FACTURAS_RD = `
Eres un extractor OCR experto en comprobantes fiscales de República Dominicana (DGII).

Vas a recibir VARIAS imágenes, cada una precedida por la etiqueta "=== IMAGEN N ===".

Analiza cada imagen por separado. Devuelve el número N exacto en "indiceImagen".

REGLAS:
- EMISOR: Empresa que emite/vende en el membrete/encabezado superior (ej: EDEESTE, Claro, comercios). RNC en "rncEmisor", nombre en "nombreEmisor".
- RECEPTOR: Cliente/comprador/abonado ("Facturado a:", "Cliente:"). RNC en "rncReceptor", nombre en "nombreReceptor".
- RNC / CÉDULA: Sin guiones ni espacios (9 u 11 dígitos puros).
- FECHA: Formato YYYY-MM-DD. Si la fecha principal es borrosa o ilegible en facturas electrónicas, usa la fecha de la firma digital.
- En servicios públicos (electricidad, telecomunicaciones), la distribuidora es el EMISOR y el cliente es el RECEPTOR.
- No inventes datos. Si un valor es ilegible o no existe, devuelve null.

Responde únicamente utilizando el schema proporcionado.
`;
