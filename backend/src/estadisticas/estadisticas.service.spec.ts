import { Prisma } from '@prisma/client';
import { FilaGrupo, totalizar } from './estadisticas.service';

function fila(overrides: Partial<FilaGrupo> = {}): FilaGrupo {
  return {
    clienteId: null,
    formato: null,
    clasificacionConfirmada: false,
    _count: { _all: 1 },
    _sum: { montoFacturado: new Prisma.Decimal(0), itbisFacturado: new Prisma.Decimal(0) },
    ...overrides,
  };
}

describe('totalizar', () => {
  it('cuenta confirmadas por clasificacionConfirmada, no por revisada', () => {
    const grupos = [
      fila({ clienteId: 'c1', clasificacionConfirmada: true, _count: { _all: 3 } }),
      fila({ clienteId: 'c1', clasificacionConfirmada: false, _count: { _all: 2 } }),
    ];
    const totales = totalizar(grupos, 0, 0);
    expect(totales.escaneadas).toBe(5);
    expect(totales.confirmadas).toBe(3);
  });

  /**
   * El embudo no está estrictamente anidado: `confirmarClasificacionLote` no
   * exige cliente, así que en principio se podría confirmar sin clasificar.
   * `totalizar` no debe asumir `confirmadas <= clasificadas`.
   */
  it('permite confirmadas sin cliente asignado (el embudo no está anidado)', () => {
    const grupos = [fila({ clienteId: null, clasificacionConfirmada: true, _count: { _all: 1 } })];
    const totales = totalizar(grupos, 0, 0);
    expect(totales.clasificadas).toBe(0);
    expect(totales.confirmadas).toBe(1);
  });

  it('sinClasificar es escaneadas menos clasificadas', () => {
    const grupos = [
      fila({ clienteId: 'c1', _count: { _all: 4 } }),
      fila({ clienteId: null, _count: { _all: 6 } }),
    ];
    const totales = totalizar(grupos, 0, 0);
    expect(totales.escaneadas).toBe(10);
    expect(totales.clasificadas).toBe(4);
    expect(totales.sinClasificar).toBe(6);
  });

  it('sin grupos, todo en cero', () => {
    const totales = totalizar([], 0, 0);
    expect(totales).toEqual({
      escaneadas: 0,
      clasificadas: 0,
      sinClasificar: 0,
      confirmadas: 0,
      exportadas: 0,
      conErrorValidacion: 0,
      montoFacturado: '0.00',
      itbisFacturado: '0.00',
    });
  });

  it('suma los montos de todas las filas, tratando _sum null como 0', () => {
    const grupos = [
      fila({ _sum: { montoFacturado: new Prisma.Decimal('100.50'), itbisFacturado: new Prisma.Decimal('18.09') } }),
      fila({ _sum: { montoFacturado: null, itbisFacturado: null } }),
    ];
    const totales = totalizar(grupos, 0, 0);
    expect(totales.montoFacturado).toBe('100.50');
    expect(totales.itbisFacturado).toBe('18.09');
  });

  it('pasa exportadas y conErrorValidacion tal cual, son conteos externos al groupBy', () => {
    const totales = totalizar([], 7, 3);
    expect(totales.exportadas).toBe(7);
    expect(totales.conErrorValidacion).toBe(3);
  });
});
