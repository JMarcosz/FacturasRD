import { parsearNcf, validarCedula, validarRnc } from '../dgii';
import type { FacturaExtraida } from '../dgii';
import {
  buscarFechaFirmaOEmision,
  buscarFormaPago,
  buscarIdentificaciones,
  buscarItbis,
  buscarNcf,
  normalizarNcfOcr,
} from './patrones-rd';
import { aplicarFallbackRncServicios } from '../utils/facturaNormalizer';

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
 * Cuando el extractor del proveedor (OpenRouter, Gemini o
 * cualquier otro `IInvoiceExtractor` futuro) no pasa nuestra propia
 * validación (dígito verificador de RNC/Cédula, formato de NCF), intenta
 * encontrar un valor mejor con los patrones de `patrones-rd.ts` sobre el
 * texto OCR completo. No sobreescribe un valor que ya es válido.
 */
export function reforzarConPatrones(hechos: FacturaExtraida, textoCompleto: string): FacturaExtraida {
  const reforzado = { ...hechos };

  // 0. Saneamiento inicial de NCF (Autocorrección 8->B, F->E)
  if (reforzado.ncf) {
    reforzado.ncf = normalizarNcfOcr(reforzado.ncf);
  }
  if (reforzado.ncfModificado) {
    reforzado.ncfModificado = normalizarNcfOcr(reforzado.ncfModificado);
  }

  // 1. GUARDRAIL: Si el modelo colocó un NCF en el campo de RNC Emisor
  if (ncfValido(reforzado.rncEmisor)) {
    if (!ncfValido(reforzado.ncf)) {
      reforzado.ncf = reforzado.rncEmisor;
    }
    reforzado.rncEmisor = null;
  }

  // 2. GUARDRAIL: Si el modelo colocó un NCF en el campo de RNC Receptor
  if (ncfValido(reforzado.rncReceptor)) {
    if (!ncfValido(reforzado.ncf)) {
      reforzado.ncf = reforzado.rncReceptor;
    }
    reforzado.rncReceptor = null;
  }

  // 3. GUARDRAIL: Si el modelo colocó un RNC/Cédula en el campo de NCF
  if (!ncfValido(reforzado.ncf) && identificacionValida(reforzado.ncf)) {
    if (!identificacionValida(reforzado.rncEmisor)) {
      reforzado.rncEmisor = (reforzado.ncf ?? '').replace(/\D/g, '');
    }
    reforzado.ncf = buscarNcf(textoCompleto) || null;
  }

  // 4. Búsqueda de NCF en texto completo si aún no es válido
  if (!ncfValido(reforzado.ncf)) {
    const candidato = buscarNcf(textoCompleto);
    if (candidato) reforzado.ncf = candidato;
  }

  // 5. Búsqueda y saneamiento de Identificaciones (RNC / Cédula)
  // IMPORTANTE: Nunca duplicar el mismo RNC en emisor y receptor
  if (!identificacionValida(reforzado.rncEmisor) || !identificacionValida(reforzado.rncReceptor)) {
    const candidatos = buscarIdentificaciones(textoCompleto);

    if (!identificacionValida(reforzado.rncEmisor)) {
      const candidatoEmisor = candidatos.find((c) => !reforzado.rncReceptor || c !== reforzado.rncReceptor.replace(/\D/g, ''));
      if (candidatoEmisor) reforzado.rncEmisor = candidatoEmisor;
    }

    if (!identificacionValida(reforzado.rncReceptor)) {
      const candidatoReceptor = candidatos.find((c) => !reforzado.rncEmisor || c !== reforzado.rncEmisor.replace(/\D/g, ''));
      if (candidatoReceptor) reforzado.rncReceptor = candidatoReceptor;
    }
  }

  // Limpiar caracteres no numéricos residuales de RNC/Cédula
  if (reforzado.rncEmisor) {
    reforzado.rncEmisor = reforzado.rncEmisor.replace(/\D/g, '') || null;
  }
  if (reforzado.rncReceptor) {
    reforzado.rncReceptor = reforzado.rncReceptor.replace(/\D/g, '') || null;
  }

  // 5.1 INTERCEPTOR DE FALLBACKS DE RNC: Inyectar RNC de emisores conocidos si falta
  if (!identificacionValida(reforzado.rncEmisor) && reforzado.nombreEmisor) {
    const fallbackEmisor = aplicarFallbackRncServicios(reforzado.nombreEmisor, reforzado.rncEmisor);
    if (fallbackEmisor) reforzado.rncEmisor = fallbackEmisor;
  }
  if (!identificacionValida(reforzado.rncReceptor) && reforzado.nombreReceptor) {
    const fallbackReceptor = aplicarFallbackRncServicios(reforzado.nombreReceptor, reforzado.rncReceptor);
    if (fallbackReceptor) reforzado.rncReceptor = fallbackReceptor;
  }

  // 6. Respaldo de Fecha de emisión o Fecha de firma digital en e-CF si no vino o es inválida
  if (!reforzado.fechaEmision || isNaN(Date.parse(reforzado.fechaEmision))) {
    const candidataFecha = buscarFechaFirmaOEmision(textoCompleto);
    if (candidataFecha) {
      reforzado.fechaEmision = candidataFecha;
    }
  }

  // 7. ITBIS respaldo si vino vacío
  if (reforzado.itbis === null || reforzado.itbis.trim() === '') {
    const candidato = buscarItbis(textoCompleto);
    if (candidato) reforzado.itbis = candidato;
  }

  // 8. Forma de pago respaldo si no vino
  if (!reforzado.formaPagoImpresa) {
    reforzado.formaPagoImpresa = buscarFormaPago(textoCompleto);
  }

  return reforzado;
}
