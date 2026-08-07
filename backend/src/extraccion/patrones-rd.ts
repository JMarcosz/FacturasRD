import { validarCedula, validarRnc } from '../dgii';

/**
 * Respaldo por expresiones regulares sobre el texto OCR crudo que devuelve
 * Document Intelligence, para cuando el modelo `prebuilt-invoice` (entrenado
 * con facturas de EEUU/internacionales) no reconoce semánticamente el RNC,
 * el NCF o el ITBIS. Estos formatos son lo bastante rígidos como para
 * localizarlos directamente en el texto, sin depender de que el modelo
 * "entienda" qué son.
 */

// El "0*" antes del grupo capturado permite ceros de relleno pegados
// directamente a la letra, como imprimen algunos POS térmicos:
// "NCF 00000000B0200467854". Un "\b" ahí fallaría porque "0" y "B" son
// ambos caracteres de palabra — nunca hay borde entre ellos.
const NCF_ETIQUETADO = /\b(?:NCF|Comprobante\s*Fiscal|N[uú]mero\s+de\s+Comprobante)\b[^A-Za-z0-9]{0,15}0*([A-Za-z]\d{10}|[Ee]\d{12})\b/i;
const NCF_LIBRE = /(?<![A-Za-z0-9])0*([A-Z]\d{10}|E\d{12})\b/;

export function buscarNcf(texto: string): string | null {
  const etiquetado = texto.match(NCF_ETIQUETADO);
  if (etiquetado) return etiquetado[1].toUpperCase();
  const libre = texto.match(NCF_LIBRE);
  return libre ? libre[1].toUpperCase() : null;
}

const RNC_CEDULA_ETIQUETADO = /\b(?:RNC|R\.?N\.?C\.?|C[eé]dula)\b[^0-9]{0,10}([\d][\d-]{7,12}\d)/gi;

/**
 * Devuelve las identificaciones (RNC de 9 dígitos o Cédula de 11) encontradas
 * en orden de aparición, ya validadas por dígito verificador. En una factura
 * dominicana típica, el RNC del emisor aparece primero (membrete/encabezado)
 * y el del receptor después (sección "Cliente"/"Señor(es)") — por eso el
 * orden importa para quien llama a esta función.
 */
export function buscarIdentificaciones(texto: string): string[] {
  const resultados: string[] = [];
  for (const match of texto.matchAll(RNC_CEDULA_ETIQUETADO)) {
    const digitos = match[1].replace(/\D/g, '');
    if (digitos.length === 9 && validarRnc(digitos)) resultados.push(digitos);
    else if (digitos.length === 11 && validarCedula(digitos)) resultados.push(digitos);
  }
  return resultados;
}

// El "(?:...%)?" opcional salta la tasa (ej. "ITBIS 18%") para no confundirla
// con el monto real, que normalmente aparece después. El hueco antes del
// monto excluye letras además de dígitos/saltos de línea: sin eso, en un
// texto "aplanado" sin saltos de línea reales (como el de Gemini) el "ITBIS"
// del encabezado de una tabla ("ITBIS PRECIO TOTAL") saltaría esas palabras
// y terminaría capturando la cantidad de la primera línea de producto.
const ITBIS_ETIQUETADO = /\bITBIS\b(?:[^\dA-Za-z\n]{0,10}\d{1,2}\s*%)?[^\dA-Za-z\n]{0,20}([\d]{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i;

export function buscarItbis(texto: string): string | null {
  const m = texto.match(ITBIS_ETIQUETADO);
  if (!m) return null;
  return m[1].replace(/,/g, '');
}

const FORMAS_PAGO_TEXTO: Record<string, RegExp> = {
  efectivo: /\befectivo\b/i,
  tarjeta: /\btarjeta\b/i,
  transferencia: /\btransferencia\b|\bdep[oó]sito\b/i,
  cheque: /\bcheque\b/i,
};

/**
 * Busca palabras de forma de pago directamente en el texto OCR (ej. recibos
 * de POS que imprimen "EFECTIVO 500.00" pero no tienen ningún campo semántico
 * para "forma de pago" en el modelo). Alimenta `formaPagoImpresa`, que ya
 * consumen `clasificarFormaVenta607`/`clasificarFormaPago606` en dgii/derivaciones.ts.
 */
export function buscarFormaPago(texto: string): string | null {
  for (const [forma, patron] of Object.entries(FORMAS_PAGO_TEXTO)) {
    if (patron.test(texto)) return forma;
  }
  return null;
}
