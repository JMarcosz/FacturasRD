import { validarCedula, validarRnc } from '../dgii';

/**
 * Respaldo por expresiones regulares sobre el texto OCR crudo para cuando
 * el modelo de IA no reconoce semánticamente el RNC, el NCF, la fecha de firma digital
 * o el ITBIS. Estos formatos son rígidos y permiten localizarlos directamente en el texto.
 */

// El "0*" antes del grupo capturado permite ceros de relleno pegados
// directamente a la letra, como imprimen algunos POS térmicos:
// "NCF 00000000B0200467854". Un "\b" ahí fallaría porque "0" y "B" son
// ambos caracteres de palabra — nunca hay borde entre ellos.
const NCF_ETIQUETADO = /\b(?:NCF|Comprobante\s*Fiscal|N[uú]mero\s+de\s+Comprobante)\b[^A-Za-z0-9]{0,15}0*([A-Za-z]\d{10}|[Ee]\d{12})\b/i;
const NCF_LIBRE = /(?<![A-Za-z0-9])0*([A-Z]\d{10}|E\d{12})\b/;

export function normalizarNcfOcr(ncf: string | null | undefined): string | null {
  if (!ncf) return null;
  let limpio = ncf.trim().toUpperCase().replace(/\s+/g, '');

  // 1. Confusión '8' por 'B' inicial (801, 802, 804, 814, 815, etc.) con 11 caracteres
  if (/^8(01|02|03|04|11|12|13|14|15|16)\d{8}$/.test(limpio)) {
    limpio = 'B' + limpio.slice(1);
  }

  // 2. Confusión 'F' por 'E' inicial en e-CF (F31, F32, F41, F44, F45)
  if (/^F(31|32|33|34|41|43|44|45|46|47)\d{10}$/.test(limpio)) {
    limpio = 'E' + limpio.slice(1);
  } else if (/^F(31|32|33|34|41|43|44|45|46|47)(\d{1,9})$/.test(limpio)) {
    const match = limpio.match(/^F(31|32|33|34|41|43|44|45|46|47)(\d+)$/);
    if (match) {
      const tipo = match[1];
      const sec = match[2].padStart(10, '0');
      limpio = `E${tipo}${sec}`;
    }
  }

  return limpio;
}

export function buscarNcf(texto: string): string | null {
  const etiquetado = texto.match(NCF_ETIQUETADO);
  if (etiquetado) return normalizarNcfOcr(etiquetado[1]);
  const libre = texto.match(NCF_LIBRE);
  return libre ? normalizarNcfOcr(libre[1]) : null;
}

const RNC_CEDULA_ETIQUETADO = /\b(?:RNC|R\.?N\.?C\.?|C[eé]dula|C[eé]d|ID\s*Tributari[ao]|Registro\s*Tributario|Identificaci[oó]n|Tax\s*ID)\b[^\d]{0,15}([\d][\d\s-]{6,18}\d)/gi;
const RNC_CEDULA_FORMATEADO_LIBRE = /\b(?:\d{1}\s*-\s*\d{2}\s*-\s*\d{5}\s*-\s*\d{1}|\d{3}\s*-\s*\d{5}\s*-\s*\d{1}|\d{3}\s*-\s*\d{7}\s*-\s*\d{1}|\d{9}|\d{11})\b/g;

/**
 * Devuelve las identificaciones (RNC de 9 dígitos o Cédula de 11) encontradas
 * en orden de aparición, con o sin guiones y espacios, validadas con el dígito verificador oficial DGII.
 * En una factura dominicana típica, el RNC del emisor aparece primero (membrete/encabezado)
 * y el del receptor después (sección "Cliente"/"Señor(es)").
 */
export function buscarIdentificaciones(texto: string): string[] {
  const resultados: string[] = [];

  const agregarSiValido = (candidato: string) => {
    const digitos = candidato.replace(/\D/g, '');
    if (resultados.includes(digitos)) return;

    if (digitos.length === 9 && validarRnc(digitos)) {
      resultados.push(digitos);
    } else if (digitos.length === 11 && validarCedula(digitos)) {
      resultados.push(digitos);
    }
  };

  // 1. Búsqueda por etiquetas explícitas (RNC, Cédula, ID Tributaria, etc.)
  for (const match of texto.matchAll(RNC_CEDULA_ETIQUETADO)) {
    agregarSiValido(match[1]);
  }

  // 2. Búsqueda de patrones formateados libres (con guiones o números puros de 9/11 dígitos)
  for (const match of texto.matchAll(RNC_CEDULA_FORMATEADO_LIBRE)) {
    agregarSiValido(match[0]);
  }

  return resultados;
}

// Búsqueda de fecha de firma digital en facturas electrónicas (e-CF)
const FECHA_FIRMA_DIGITAL = /(?:fecha\s*(?:y\s*hora)?\s*(?:de\s*)?(?:firma(?:\s*digital)?|certificaci[oó]n|sellado)|firmado\s*(?:digitalmente)?(?:\s*el)?|digital\s*signature\s*date|sello\s*digital)[^\d]{0,20}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i;
const FECHA_EMISION_GENERAL = /(?:fecha(?:\s*de\s*(?:emisi[oó]n|factura|comprobante))?|date)[^\d]{0,15}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i;

function normalizarFecha(str: string): string | null {
  const limpia = str.replace(/[^\d/-]/g, '');
  // YYYY-MM-DD o YYYY/MM/DD
  const iso = limpia.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // DD-MM-YYYY o DD/MM/YYYY
  const dmy = limpia.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    let y = dmy[3];
    if (y.length === 2) y = `20${y}`;
    const m = dmy[2].padStart(2, '0');
    const d = dmy[1].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Busca la fecha de firma digital (en facturas electrónicas e-CF) o la fecha de emisión general.
 * Útil cuando la fecha principal de la factura está borrosa o ilegible.
 */
export function buscarFechaFirmaOEmision(texto: string): string | null {
  const matchFirma = texto.match(FECHA_FIRMA_DIGITAL);
  if (matchFirma) {
    const normalizada = normalizarFecha(matchFirma[1]);
    if (normalizada) return normalizada;
  }

  const matchGeneral = texto.match(FECHA_EMISION_GENERAL);
  if (matchGeneral) {
    const normalizada = normalizarFecha(matchGeneral[1]);
    if (normalizada) return normalizada;
  }

  return null;
}

// El "(?:...%)?" opcional salta la tasa (ej. "ITBIS 18%") para no confundirla
// con el monto real, que normalmente aparece después.
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
 * Busca palabras de forma de pago directamente en el texto OCR.
 */
export function buscarFormaPago(texto: string): string | null {
  for (const [forma, patron] of Object.entries(FORMAS_PAGO_TEXTO)) {
    if (patron.test(texto)) return forma;
  }
  return null;
}
