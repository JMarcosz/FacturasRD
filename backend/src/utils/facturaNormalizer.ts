import { RNC_SERVICIOS_RD } from '../config/constants/emisoresPublicos';
import { isValidRncOrCedula } from '../extraccion/validation/extraction.validator';

/**
 * Normaliza una cadena de texto eliminando acentos, caracteres especiales y espacios redundantes.
 */
export function normalizarNombreEntidad(nombre: string | null | undefined): string {
  if (!nombre) return '';
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes y diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ') // Quitar puntuaciones (puntos, comas, guiones)
    .replace(/\s+/g, ' ') // Colapsar espacios múltiples
    .trim();
}

/**
 * Intercepta la respuesta JSON extraída por el OCR de la IA e inyecta identificadores fiscales
 * conocidos para emisores masivos o de servicios públicos cuando el OCR no detecta el RNC.
 */
export function aplicarFallbackRncServicios(
  nombreEmisor: string | null | undefined,
  rncActual: string | null | undefined,
): string | null {
  // 1. Early Return: Si el RNC actual ya es válido según el algoritmo oficial de la DGII
  if (rncActual && isValidRncOrCedula(rncActual)) {
    return rncActual.replace(/\D/g, '');
  }

  if (!nombreEmisor || !nombreEmisor.trim()) {
    return rncActual?.replace(/\D/g, '') || null;
  }

  const norm = normalizarNombreEntidad(nombreEmisor);
  if (!norm) return rncActual?.replace(/\D/g, '') || null;

  // 2. Búsqueda exacta en catálogo
  if (RNC_SERVICIOS_RD[norm]) {
    const rnc = RNC_SERVICIOS_RD[norm];
    console.info(`[Fallback OCR] RNC corregido para emisor: "${nombreEmisor}" -> ${rnc}`);
    return rnc;
  }

  // 3. Búsqueda iterativa bidireccional (includes)
  for (const [clave, rnc] of Object.entries(RNC_SERVICIOS_RD)) {
    const claveNorm = normalizarNombreEntidad(clave);
    if (norm === claveNorm || norm.includes(claveNorm) || claveNorm.includes(norm)) {
      console.info(`[Fallback OCR] RNC corregido para emisor: "${nombreEmisor}" -> ${rnc}`);
      return rnc;
    }
  }

  // 4. Búsqueda por palabras clave determinísticas de alta especificidad
  const palabrasClave: Array<{ token: string; rnc: string }> = [
    { token: 'EDEESTE', rnc: '101797931' },
    { token: 'EDESUR', rnc: '101618787' },
    { token: 'EDENORTE', rnc: '101788223' },
    { token: 'CLARO', rnc: '101001577' },
    { token: 'CODETEL', rnc: '101001577' },
    { token: 'ALTICE', rnc: '130983196' },
    { token: 'CAASD', rnc: '401007455' },
    { token: 'CORAASAN', rnc: '402000454' },
    { token: 'TRILOGY', rnc: '101820217' },
    { token: 'VIVA', rnc: '101820217' },
    { token: 'CEPM', rnc: '101780000' },
    { token: 'COMETA', rnc: '101019433' },
    { token: 'CACHUCHA', rnc: '132545542' },
    { token: 'THE MARKET', rnc: '130851255' },
    { token: 'MACORD', rnc: '130196941' },
  ];

  for (const { token, rnc } of palabrasClave) {
    if (norm.includes(token)) {
      console.info(`[Fallback OCR] RNC corregido para emisor: "${nombreEmisor}" -> ${rnc}`);
      return rnc;
    }
  }

  return rncActual?.replace(/\D/g, '') || null;
}
