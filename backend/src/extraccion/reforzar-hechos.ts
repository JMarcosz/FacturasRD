import { parsearNcf, validarCedula, validarRnc } from '../dgii';
import type { FacturaExtraida } from '../dgii';
import { buscarFormaPago, buscarIdentificaciones, buscarItbis, buscarNcf } from './patrones-rd';

export function identificacionValida(valor: string | null): boolean {
  if (!valor) return false;
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length === 9) return validarRnc(digitos);
  if (digitos.length === 11) return validarCedula(digitos);
  return false;
}

export function ncfValido(valor: string | null): boolean {
  return !!valor && parsearNcf(valor).formatoValido;
}

/**
 * Respaldo extractor-agnóstico: si lo que devolvió el modelo (Gemini, o
 * cualquier otro `IInvoiceExtractor` futuro) no pasa nuestra propia
 * validación (dígito verificador de RNC/Cédula, formato de NCF), intenta
 * encontrar un valor mejor con los patrones de `patrones-rd.ts` sobre el
 * texto OCR completo. No sobreescribe un valor que ya es válido.
 */
export function reforzarConPatrones(hechos: FacturaExtraida, textoCompleto: string): FacturaExtraida {
  const reforzado = { ...hechos };

  if (!ncfValido(reforzado.ncf)) {
    const candidato = buscarNcf(textoCompleto);
    if (candidato) reforzado.ncf = candidato;
  }

  if (!identificacionValida(reforzado.rncEmisor) || !identificacionValida(reforzado.rncReceptor)) {
    const candidatos = buscarIdentificaciones(textoCompleto);
    if (!identificacionValida(reforzado.rncEmisor) && candidatos[0]) reforzado.rncEmisor = candidatos[0];
    if (!identificacionValida(reforzado.rncReceptor) && candidatos[1]) reforzado.rncReceptor = candidatos[1];
  }

  // Un "0" explícito del modelo es una respuesta válida (ítems exentos de
  // ITBIS, muy comunes en RD) — solo se busca en el texto cuando el campo
  // vino vacío/null, nunca para "corregir" un cero que el modelo sí eligió.
  if (reforzado.itbis === null || reforzado.itbis.trim() === '') {
    const candidato = buscarItbis(textoCompleto);
    if (candidato) reforzado.itbis = candidato;
  }

  if (!reforzado.formaPagoImpresa) {
    reforzado.formaPagoImpresa = buscarFormaPago(textoCompleto);
  }

  return reforzado;
}
