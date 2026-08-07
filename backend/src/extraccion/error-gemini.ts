export interface InfoErrorGemini {
  esRateLimit: boolean;
  retryDelayMs: number | null;
}

/**
 * El SDK de Gemini deja el cuerpo JSON del error de la API como `message` de
 * la excepción. Lo interpretamos para distinguir "too many requests"
 * (recuperable esperando) de cualquier otro error, y para usar el
 * `retryDelay` que la propia API sugiere en vez de adivinar cuánto esperar.
 */
export function analizarErrorGemini(e: unknown): InfoErrorGemini {
  const mensaje = e instanceof Error ? e.message : String(e);

  try {
    const parseado = JSON.parse(mensaje);
    const codigo = parseado?.error?.code;
    const status = parseado?.error?.status;
    const esRateLimit = codigo === 429 || status === 'RESOURCE_EXHAUSTED';

    const detalles: Array<Record<string, unknown>> = parseado?.error?.details ?? [];
    const retryInfo = detalles.find((d) => String(d?.['@type'] ?? '').includes('RetryInfo'));
    const retryDelayStr = retryInfo?.retryDelay as string | undefined;
    const retryDelayMs = retryDelayStr ? Math.ceil(parseFloat(retryDelayStr) * 1000) : null;

    return { esRateLimit, retryDelayMs };
  } catch {
    // El mensaje no es JSON (ej. error de red) — heurística por texto como
    // último recurso, sin retryDelay porque no hay de dónde sacarlo.
    const esRateLimit = /"code":\s*429|RESOURCE_EXHAUSTED|too many requests/i.test(mensaje);
    return { esRateLimit, retryDelayMs: null };
  }
}
