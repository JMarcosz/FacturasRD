import Decimal from 'decimal.js';
import { validarCedula, validarRnc } from './rnc';
import { esNotaCredito, parsearNcf } from './ncf';
import { esFormaPagoValida, esTipoBienesServiciosValido, esTipoIngresoValido } from './catalogos';
import type { ContextoValidacion, FacturaDgii606, FacturaDgii607, ResultadoValidacion } from './types';

type Factura607ParaValidar = Omit<FacturaDgii607, 'fechaComprobante'> & { fechaComprobante: Date | null };
type Factura606ParaValidar = Omit<FacturaDgii606, 'fechaComprobante'> & { fechaComprobante: Date | null };

const TOLERANCIA_CENTAVOS = new Decimal('1.00');

function err(codigo: string, campo: string | null, mensaje: string): ResultadoValidacion {
  return { codigo, severidad: 'ERROR', campo, mensaje };
}
function warn(codigo: string, campo: string | null, mensaje: string): ResultadoValidacion {
  return { codigo, severidad: 'WARNING', campo, mensaje };
}

function yyyymmDe(fecha: Date): string {
  return `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** Validaciones comunes a 606 y 607: identificación, NCF, fechas. */
function validarComun(
  f: { rncCedula: string; tipoIdentificacion: string; ncf: string; ncfModificado: string | null; fechaComprobante: Date | null },
  contexto: ContextoValidacion,
  opciones: {
    permitirIdentificacionVaciaEnConsumo?: boolean;
    campoIdentificacion: 'identificacionEmisor' | 'identificacionReceptor';
  },
): ResultadoValidacion[] {
  const resultados: ResultadoValidacion[] = [];
  const ncfInfo = parsearNcf(f.ncf || '');
  const campoId = opciones.campoIdentificacion;

  // NCF tipo 02 (Consumo) es una venta a consumidor final: la DGII no exige
  // identificar al comprador ahí — es la realidad de cualquier venta de
  // mostrador (recibo de POS, "Factura para consumidor final"). Solo aplica
  // a 607 (ventas); en 606 el proveedor casi siempre es una empresa con RNC.
  const esConsumoFinalSinIdentificacion =
    opciones.permitirIdentificacionVaciaEnConsumo && ncfInfo.formatoValido && ncfInfo.tipo === '02';

  if (!f.rncCedula) {
    if (!esConsumoFinalSinIdentificacion) {
      resultados.push(err('IDENTIFICACION_FALTANTE', campoId, 'No se detectó RNC/Cédula.'));
    }
  } else if (f.tipoIdentificacion === '1' && !validarRnc(f.rncCedula)) {
    resultados.push(err('RNC_INVALIDO', campoId, `El RNC "${f.rncCedula}" no pasa el dígito verificador.`));
  } else if (f.tipoIdentificacion === '2' && !validarCedula(f.rncCedula)) {
    resultados.push(err('CEDULA_INVALIDA', campoId, `La cédula "${f.rncCedula}" no pasa el dígito verificador.`));
  }

  if (!ncfInfo.formatoValido) {
    resultados.push(err('NCF_FORMATO', 'ncf', `"${f.ncf}" no tiene un formato de NCF/e-CF válido.`));
  } else if (!ncfInfo.tipoValido) {
    resultados.push(err('NCF_TIPO_NO_PERMITIDO', 'ncf', `El tipo de comprobante "${ncfInfo.tipo}" no está en el catálogo de la DGII.`));
  } else {
    const clave = `${f.rncCedula}:${ncfInfo.valor}`;
    if (contexto.ncfsYaDeclarados.has(clave)) {
      resultados.push(err('NCF_DUPLICADO', 'ncf', `El NCF "${ncfInfo.valor}" ya fue declarado para "${f.rncCedula}".`));
    }
    if (esNotaCredito(ncfInfo.valor) && !f.ncfModificado) {
      resultados.push(err('NC_SIN_MODIFICADO', 'ncfModificado', 'Es una Nota de Crédito y falta el NCF Modificado.'));
    }
  }

  if (!f.fechaComprobante) {
    resultados.push(err('FECHA_COMPROBANTE_FALTANTE', 'fechaComprobante', 'No se detectó la fecha del comprobante.'));
  } else if (yyyymmDe(f.fechaComprobante) !== contexto.yyyymm) {
    resultados.push(
      warn('FECHA_FUERA_PERIODO', 'fechaComprobante', `La fecha del comprobante no cae dentro del período ${contexto.yyyymm}.`),
    );
  }

  return resultados;
}

function validarConfianza(contexto: ContextoValidacion): ResultadoValidacion[] {
  if (!contexto.confidences) return [];
  const umbral = contexto.umbralConfianza ?? 0.85;
  return Object.entries(contexto.confidences)
    .filter(([, valor]) => valor < umbral)
    .map(([campo, valor]) =>
      warn('BAJA_CONFIANZA', campo, `Confianza de extracción baja (${Math.round(valor * 100)}%) — verificar contra el documento.`),
    );
}

export function validarFactura607(f: Factura607ParaValidar, contexto: ContextoValidacion): ResultadoValidacion[] {
  const resultados = [
    ...validarComun(f, contexto, { permitirIdentificacionVaciaEnConsumo: true, campoIdentificacion: 'identificacionReceptor' }),
    ...validarConfianza(contexto),
  ];

  if (f.fechaRetencionOPago && f.fechaComprobante && f.fechaRetencionOPago < f.fechaComprobante) {
    resultados.push(warn('FECHA_PAGO_ANTERIOR', 'fechaRetencionOPago', 'La fecha de retención es anterior a la del comprobante.'));
  }

  if (!f.tipoIngreso || !esTipoIngresoValido(f.tipoIngreso)) {
    resultados.push(err('CLASIFICACION_FALTANTE', 'tipoIngreso', 'Falta asignar el Tipo de Ingreso.'));
  }

  const emisoresServiciosExentos = new Set([
    '101797931', // EDEESTE
    '101618787', // EDESUR
    '101788223', // EDENORTE
    '101780000', // CEPM
    '401007455', // CAASD
    '402000454', // CORAASAN
    '401007463', // INAPA
  ]);

  const esNotaCredito607 = esNotaCredito(f.ncf || '');
  const tieneItbisCero607 = f.itbisFacturado.isZero();

  if (!(tieneItbisCero607 && esNotaCredito607)) {
    const esperadoItbis = f.montoFacturado.times(contexto.tasaItbis);
    if (f.itbisFacturado.minus(esperadoItbis).abs().gt(TOLERANCIA_CENTAVOS)) {
      resultados.push(
        warn(
          'ITBIS_INCONSISTENTE',
          'itbisFacturado',
          `ITBIS facturado (${f.itbisFacturado.toFixed(2)}) no cuadra con el ${contexto.tasaItbis.times(100).toFixed(0)}% de ${f.montoFacturado.toFixed(2)}.`,
        ),
      );
    }
  }

  const distribucion = f.montoEfectivo
    .plus(f.montoChequeTransferencia)
    .plus(f.montoTarjeta)
    .plus(f.montoVentaCredito)
    .plus(f.montoBonos)
    .plus(f.montoPermuta)
    .plus(f.montoOtrasFormas);
  const totalConImpuesto = f.montoFacturado.plus(f.itbisFacturado);

  if (distribucion.isZero() && totalConImpuesto.gt(0)) {
    resultados.push(err('FORMA_VENTA_INDEFINIDA', null, 'No se ha distribuido el monto entre ninguna forma de venta.'));
  } else if (distribucion.minus(totalConImpuesto).abs().gt(TOLERANCIA_CENTAVOS)) {
    resultados.push(warn('DESCUADRE_607', null, 'La suma de las formas de venta no cuadra con Monto Facturado + ITBIS.'));
  }

  return resultados;
}

export function validarFactura606(f: Factura606ParaValidar, contexto: ContextoValidacion): ResultadoValidacion[] {
  const resultados = [
    ...validarComun(f, contexto, { campoIdentificacion: 'identificacionEmisor' }),
    ...validarConfianza(contexto),
  ];

  if (f.fechaRetencionOPago && f.fechaComprobante && f.fechaRetencionOPago < f.fechaComprobante) {
    resultados.push(warn('FECHA_PAGO_ANTERIOR', 'fechaRetencionOPago', 'La fecha de pago es anterior a la del comprobante.'));
  }

  if (!f.tipoBienesServicios || !esTipoBienesServiciosValido(f.tipoBienesServicios)) {
    resultados.push(err('CLASIFICACION_FALTANTE', 'tipoBienesServicios', 'Falta asignar el Tipo de Bienes y Servicios Comprados.'));
  }
  if (!f.formaPago || !esFormaPagoValida(f.formaPago)) {
    resultados.push(err('CLASIFICACION_FALTANTE', 'formaPago', 'Falta asignar la Forma de Pago.'));
  }

  const emisoresServiciosExentos = new Set([
    '101797931', // EDEESTE
    '101618787', // EDESUR
    '101788223', // EDENORTE
    '101780000', // CEPM
    '401007455', // CAASD
    '402000454', // CORAASAN
    '401007463', // INAPA
  ]);

  const esNotaCredito606 = esNotaCredito(f.ncf || '');
  const esServicioExento606 = emisoresServiciosExentos.has(f.rncCedula);
  const tieneItbisCero606 = f.itbisFacturado.isZero();

  if (!(tieneItbisCero606 && (esNotaCredito606 || esServicioExento606))) {
    const esperadoItbis = f.montoFacturado.times(contexto.tasaItbis);
    if (f.itbisFacturado.minus(esperadoItbis).abs().gt(TOLERANCIA_CENTAVOS)) {
      resultados.push(
        warn(
          'ITBIS_INCONSISTENTE',
          'itbisFacturado',
          `ITBIS facturado (${f.itbisFacturado.toFixed(2)}) no cuadra con el ${contexto.tasaItbis.times(100).toFixed(0)}% de ${f.montoFacturado.toFixed(2)}.`,
        ),
      );
    }
  }

  if (f.montoServicios.plus(f.montoBienes).minus(f.montoFacturado).abs().gt(TOLERANCIA_CENTAVOS)) {
    resultados.push(warn('DESCUADRE_606', null, 'Servicios + Bienes no cuadra con Monto Facturado.'));
  }

  return resultados;
}
