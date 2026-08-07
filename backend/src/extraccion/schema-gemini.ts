import { Type, type Schema } from '@google/genai';

const TXT: Schema = {
  type: Type.STRING,
  nullable: true,
};

export const ESQUEMA_HECHOS: Schema = {
  type: Type.OBJECT,
  properties: {
    rncEmisor: {
      ...TXT,
      description: 'RNC (9 dígitos) o Cédula (11 dígitos) del emisor. Solo dígitos.',
    },
    nombreEmisor: {
      ...TXT,
      description: 'Nombre comercial o razón social del emisor.',
    },
    rncReceptor: {
      ...TXT,
      description: 'RNC o Cédula del comprador. Si no aparece impreso devuelve null.',
    },
    nombreReceptor: {
      ...TXT,
      description: 'Nombre del comprador o cliente.',
    },
    ncf: {
      ...TXT,
      description:
        'NCF principal. Si está dentro de otra cadena (ej: 000000B0100000123) devuelve únicamente B0100000123 o E310000000045.',
    },
    ncfModificado: {
      ...TXT,
      description: 'NCF afectado únicamente para Notas de Crédito o Débito.',
    },
    fechaEmision: {
      ...TXT,
      description:
        'Fecha de emisión en formato YYYY-MM-DD. Ignorar fecha de vencimiento, impresión y entrega.',
    },
    montoGravado: {
      ...TXT,
      description: 'Subtotal gravado antes de impuestos. Solo número como string.',
    },
    montoExento: {
      ...TXT,
      description: 'Monto exento. Solo número como string.',
    },
    itbis: {
      ...TXT,
      description: 'ITBIS facturado. No incluir ITBIS retenido ni percibido.',
    },
    isc: {
      ...TXT,
      description: 'Impuesto Selectivo al Consumo.',
    },
    propinaLegal: {
      ...TXT,
      description: 'Propina legal.',
    },
    otrosImpuestos: {
      ...TXT,
      description: 'Otros impuestos o cargos fiscales.',
    },
    montoTotal: {
      ...TXT,
      description: 'Monto total a pagar. Solo número como string.',
    },
    formaPagoImpresa: {
      ...TXT,
      description: 'Texto exacto de la forma de pago impresa.',
    },
    condicionPago: {
      ...TXT,
      description: 'Condición de pago impresa.',
    },
  },
  required: [
    'rncEmisor',
    'nombreEmisor',
    'rncReceptor',
    'nombreReceptor',
    'ncf',
    'ncfModificado',
    'fechaEmision',
    'montoGravado',
    'montoExento',
    'itbis',
    'isc',
    'propinaLegal',
    'otrosImpuestos',
    'montoTotal',
    'formaPagoImpresa',
    'condicionPago',
  ],
};

const ESQUEMA_CONFIDENCES: Schema = {
  type: Type.ARRAY,
  description: 'Confianza (0 a 1) autoevaluada por el modelo, una entrada por cada campo de "hechos" que no sea null.',
  items: {
    type: Type.OBJECT,
    properties: {
      campo: { type: Type.STRING },
      confianza: { type: Type.NUMBER },
    },
    required: ['campo', 'confianza'],
  },
};

export const ESQUEMA_RESPUESTA_GEMINI: Schema = {
  type: Type.OBJECT,
  properties: {
    hechos: ESQUEMA_HECHOS,
    confidences: ESQUEMA_CONFIDENCES,
    textoCompleto: { type: Type.STRING, description: 'Todo el texto reconocido en el documento, en orden de lectura.' },
  },
  required: ['hechos', 'confidences', 'textoCompleto'],
};

export const ESQUEMA_LOTE_GEMINI: Schema = {
  type: Type.OBJECT,
  properties: {
    resultados: {
      type: Type.ARRAY,
      description: 'Exactamente una entrada por cada imagen recibida, en cualquier orden — el emparejamiento lo define "indiceImagen", no la posición en este array.',
      items: {
        type: Type.OBJECT,
        properties: {
          indiceImagen: {
            type: Type.INTEGER,
            description: 'El N de la etiqueta "=== IMAGEN N ===" de esta factura. Obligatorio y debe coincidir exactamente.',
          },
          hechos: ESQUEMA_HECHOS,
          confidences: ESQUEMA_CONFIDENCES,
          textoCompleto: { type: Type.STRING, description: 'Todo el texto reconocido en ESTA imagen puntual.' },
        },
        required: ['indiceImagen', 'hechos', 'confidences', 'textoCompleto'],
      },
    },
  },
  required: ['resultados'],
};
