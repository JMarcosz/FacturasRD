/**
 * Espaciador de requests: garantiza que dos llamadas no arranquen separadas
 * por menos de `minIntervaloMs`, sin importar cuántas lleguen "a la vez" (ej.
 * varios workers concurrentes disparando al mismo tiempo). Es la defensa
 * PROACTIVA contra "too many requests" — en vez de mandar todo junto y
 * reaccionar recién cuando la API devuelve 429, se reparte el ritmo desde
 * el vamos para nunca llegar a ese límite.
 */
export class LimitadorTasa {
  private disponibleDesde = 0;

  constructor(private readonly minIntervaloMs: number) {}

  async esperarTurno(): Promise<void> {
    const ahora = Date.now();
    const inicio = Math.max(ahora, this.disponibleDesde);
    this.disponibleDesde = inicio + this.minIntervaloMs;
    const espera = inicio - ahora;
    if (espera > 0) {
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }
}
