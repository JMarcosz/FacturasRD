import { LimitadorTasa } from './limitador-tasa';

describe('LimitadorTasa', () => {
  it('deja pasar la primera llamada sin esperar', async () => {
    const limitador = new LimitadorTasa(200);
    const inicio = Date.now();
    await limitador.esperarTurno();
    expect(Date.now() - inicio).toBeLessThan(100);
  });

  it('espacía llamadas concurrentes según el intervalo mínimo', async () => {
    const limitador = new LimitadorTasa(80);
    const inicio = Date.now();
    await Promise.all([limitador.esperarTurno(), limitador.esperarTurno(), limitador.esperarTurno()]);
    // La tercera llamada en pasar debió esperar al menos 2 * 80ms desde el inicio.
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(150);
  });

  it('no acumula espera de más si las llamadas ya vienen espaciadas naturalmente', async () => {
    const limitador = new LimitadorTasa(50);
    const inicio = Date.now();
    await limitador.esperarTurno();
    await new Promise((r) => setTimeout(r, 60));
    await limitador.esperarTurno();
    expect(Date.now() - inicio).toBeLessThan(120);
  });
});
