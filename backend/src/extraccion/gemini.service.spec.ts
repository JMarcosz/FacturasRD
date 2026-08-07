import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiExtractorService } from './gemini.service';
import type { FacturaExtraida } from '../dgii';

jest.mock('@google/genai', () => {
  const real = jest.requireActual('@google/genai');
  return { ...real, GoogleGenAI: jest.fn() };
});

function fakeConfig(): ConfigService {
  return {
    getOrThrow: () => 'fake-key',
    // GEMINI_MIN_INTERVALO_MS en 0 para que los tests no esperen de verdad.
    get: (key: string, def?: unknown) => (key === 'GEMINI_MIN_INTERVALO_MS' ? 0 : def),
  } as unknown as ConfigService;
}

function hechosVacios(overrides: Partial<FacturaExtraida> = {}): FacturaExtraida {
  return {
    rncEmisor: null,
    nombreEmisor: null,
    rncReceptor: null,
    nombreReceptor: null,
    ncf: null,
    ncfModificado: null,
    fechaEmision: null,
    fechaVencimientoNcf: null,
    montoGravado: null,
    montoExento: null,
    itbis: null,
    isc: null,
    propinaLegal: null,
    otrosImpuestos: null,
    montoTotal: null,
    moneda: null,
    tasaCambio: null,
    formaPagoImpresa: null,
    condicionPago: null,
    lineas: [],
    ...overrides,
  };
}

function itemLote(indiceImagen: number, montoTotal: string) {
  return { indiceImagen, hechos: hechosVacios({ montoTotal }), confidences: [], textoCompleto: '' };
}

function documentos(n: number) {
  return Array.from({ length: n }, (_, i) => ({ buffer: Buffer.from(`img${i}`), mimeType: 'image/jpeg' }));
}

describe('GeminiExtractorService.extraerLote — alineamiento por índice', () => {
  let generateContent: jest.Mock;

  beforeEach(() => {
    generateContent = jest.fn();
    (GoogleGenAI as unknown as jest.Mock).mockImplementation(() => ({ models: { generateContent } }));
  });

  it('alinea resultados por indiceImagen aunque el modelo los devuelva fuera de orden', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ resultados: [itemLote(2, '20'), itemLote(1, '10'), itemLote(3, '30')] }),
    });
    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(3));
    expect(resultados.map((r) => r?.hechos.montoTotal)).toEqual(['10', '20', '30']);
  });

  it('un índice repetido queda null en esa posición — nunca se asigna al primero ni al último que llegó', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ resultados: [itemLote(1, '10'), itemLote(1, '99'), itemLote(2, '20')] }),
    });
    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(2));
    expect(resultados[0]).toBeNull();
    expect(resultados[1]?.hechos.montoTotal).toBe('20');
  });

  it('si el modelo se salta un índice, esa posición queda null sin afectar a las demás', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ resultados: [itemLote(1, '10')] }), // nunca llegó la imagen 2
    });
    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(2));
    expect(resultados[0]?.hechos.montoTotal).toBe('10');
    expect(resultados[1]).toBeNull();
  });

  it('descarta un índice fuera de rango sin romper el resto del lote', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ resultados: [itemLote(1, '10'), itemLote(99, '999'), itemLote(2, '20')] }),
    });
    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(2));
    expect(resultados.map((r) => r?.hechos.montoTotal)).toEqual(['10', '20']);
  });

  it('con un solo documento no arma un lote — delega a extraer()', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ hechos: hechosVacios({ montoTotal: '5' }), confidences: [], textoCompleto: '' }),
    });
    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(1));
    expect(resultados).toHaveLength(1);
    expect(resultados[0]?.hechos.montoTotal).toBe('5');
  });

  it('con cero documentos devuelve un array vacío sin llamar a la API', async () => {
    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote([]);
    expect(resultados).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('GeminiExtractorService.extraerLote — partición al truncar', () => {
  let generateContent: jest.Mock;

  beforeEach(() => {
    generateContent = jest.fn();
    (GoogleGenAI as unknown as jest.Mock).mockImplementation(() => ({ models: { generateContent } }));
  });

  it('si el lote entero trunca, lo parte en dos mitades y las reintenta en serie', async () => {
    generateContent
      .mockResolvedValueOnce({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) // lote de 4 completo
      .mockResolvedValueOnce({ text: JSON.stringify({ resultados: [itemLote(1, '10'), itemLote(2, '20')] }) }) // primera mitad
      .mockResolvedValueOnce({ text: JSON.stringify({ resultados: [itemLote(1, '30'), itemLote(2, '40')] }) }); // segunda mitad

    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(4));

    expect(resultados.map((r) => r?.hechos.montoTotal)).toEqual(['10', '20', '30', '40']);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('reintenta la partición si una mitad también trunca', async () => {
    generateContent
      .mockResolvedValueOnce({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) // lote de 4
      .mockResolvedValueOnce({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) // primera mitad (2) también trunca
      .mockResolvedValueOnce({ text: JSON.stringify({ hechos: hechosVacios({ montoTotal: '1' }), confidences: [], textoCompleto: '' }) }) // doc 1 solo
      .mockResolvedValueOnce({ text: JSON.stringify({ hechos: hechosVacios({ montoTotal: '2' }), confidences: [], textoCompleto: '' }) }) // doc 2 solo
      .mockResolvedValueOnce({ text: JSON.stringify({ resultados: [itemLote(1, '30'), itemLote(2, '40')] }) }); // segunda mitad

    const servicio = new GeminiExtractorService(fakeConfig());
    const resultados = await servicio.extraerLote(documentos(4));

    expect(resultados.map((r) => r?.hechos.montoTotal)).toEqual(['1', '2', '30', '40']);
  });

  it('un fallo que no es truncamiento no se parte: se propaga tal cual', async () => {
    generateContent.mockRejectedValue(new Error('network down'));
    const servicio = new GeminiExtractorService(fakeConfig());
    await expect(servicio.extraerLote(documentos(4))).rejects.toThrow('network down');
    // Sin la partición de por medio: una sola llamada real (el limitador de
    // rate-limit no se activa para un error que no es 429).
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
