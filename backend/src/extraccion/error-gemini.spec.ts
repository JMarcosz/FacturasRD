import { analizarErrorGemini } from './error-gemini';

function errorConMensaje(mensaje: string): Error {
  return new Error(mensaje);
}

describe('analizarErrorGemini', () => {
  it('reconoce un 429 con retryDelay explícito', () => {
    const mensaje = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '10.6s' }],
      },
    });
    const info = analizarErrorGemini(errorConMensaje(mensaje));
    expect(info.esRateLimit).toBe(true);
    expect(info.retryDelayMs).toBe(10600);
  });

  it('reconoce RESOURCE_EXHAUSTED aunque no venga el código 429 numérico', () => {
    const mensaje = JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } });
    expect(analizarErrorGemini(errorConMensaje(mensaje)).esRateLimit).toBe(true);
  });

  it('no marca como rate-limit un error distinto (ej. modelo no encontrado)', () => {
    const mensaje = JSON.stringify({ error: { code: 404, status: 'NOT_FOUND' } });
    const info = analizarErrorGemini(errorConMensaje(mensaje));
    expect(info.esRateLimit).toBe(false);
    expect(info.retryDelayMs).toBeNull();
  });

  it('devuelve retryDelayMs null cuando el 429 no trae RetryInfo', () => {
    const mensaje = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [] } });
    const info = analizarErrorGemini(errorConMensaje(mensaje));
    expect(info.esRateLimit).toBe(true);
    expect(info.retryDelayMs).toBeNull();
  });

  it('no explota si el mensaje no es JSON válido', () => {
    const info = analizarErrorGemini(errorConMensaje('fetch failed: ECONNRESET'));
    expect(info.esRateLimit).toBe(false);
    expect(info.retryDelayMs).toBeNull();
  });
});
