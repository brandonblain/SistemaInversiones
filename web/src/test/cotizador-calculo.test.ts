import { describe, expect, it } from 'vitest';
import { CAPITAL_MAXIMO_CENTS, cotizar, PRODUCTOS, PRODUCTOS_COTIZADOR, productoValido } from '../cotizador/cotizador';
import { parsePesosToCents } from '../lib/parse';

const producto = (nombre: string) => PRODUCTOS.find((p) => p.nombre === nombre)!;

describe('Cotizador: configuración y fórmulas', () => {
  it('los seis productos con sus plazos y rendimientos totales', () => {
    expect(PRODUCTOS.map((p) => [p.nombre, p.meses, p.rendimientoPct])).toEqual([
      ['Arrendamiento de cómputo', 12, 12],
      ['Rampas de vehículos', 24, 30],
      ['Autos utilitarios', 24, 35],
      ['Transporte eléctrico', 12, 16],
      ['Tecnología y Desarrollo', 12, 10],
      ['Desarrollo Franquicias', 18, 22]
    ]);
    expect(PRODUCTOS_COTIZADOR.every(productoValido)).toBe(true);
  });

  it('$100,000: ganancia y capital final esperados para cada producto', () => {
    const esperado: Record<string, [number, number]> = {
      'Arrendamiento de cómputo': [12_000, 112_000],
      'Rampas de vehículos': [30_000, 130_000],
      'Autos utilitarios': [35_000, 135_000],
      'Transporte eléctrico': [16_000, 116_000],
      'Tecnología y Desarrollo': [10_000, 110_000],
      'Desarrollo Franquicias': [22_000, 122_000]
    };
    for (const p of PRODUCTOS) {
      const c = cotizar(10_000_000, p)!;
      expect([c.gananciaCents / 100, c.capitalFinalCents / 100]).toEqual(esperado[p.nombre]);
      expect(c.serie).toHaveLength(p.meses + 1);
      expect(c.serie[0]).toEqual({ mes: 0, capitalCents: 10_000_000 });
      expect(c.serie[c.serie.length - 1]).toEqual({ mes: p.meses, capitalCents: c.capitalFinalCents });
    }
  });

  it('serie lineal mes a mes: $100,000 a 24 meses con 35 %', () => {
    const c = cotizar(10_000_000, producto('Autos utilitarios'))!;
    const en = (mes: number) => c.serie[mes]!.capitalCents / 100;
    expect([en(0), en(6), en(12), en(18), en(24)]).toEqual([100_000, 108_750, 117_500, 126_250, 135_000]);
    for (let m = 1; m < c.serie.length; m++) expect(c.serie[m]!.capitalCents).toBeGreaterThanOrEqual(c.serie[m - 1]!.capitalCents);
  });

  it('decimales y separadores de miles, sin errores de punto flotante', () => {
    expect(parsePesosToCents('1,000,000.50')).toBe(100_000_050);
    expect(cotizar(parsePesosToCents('1,000,000.50')!, producto('Arrendamiento de cómputo'))!.gananciaCents).toBe(12_000_006);
    expect(cotizar(parsePesosToCents('0.01')!, producto('Tecnología y Desarrollo'))!.capitalFinalCents).toBe(1);
    expect(cotizar(CAPITAL_MAXIMO_CENTS, producto('Autos utilitarios'))!.capitalFinalCents).toBe(135_000_000_000);
  });

  it('entradas inválidas no producen resultados', () => {
    for (const texto of ['', 'abc', '-500', '12a', '1.234', '$ -1']) expect(parsePesosToCents(texto)).toBeNull();
    const p = producto('Autos utilitarios');
    expect(cotizar(0, p)).toBeNull();
    expect(cotizar(-100, p)).toBeNull();
    expect(cotizar(CAPITAL_MAXIMO_CENTS + 1, p)).toBeNull();
    expect(cotizar(100, { ...p, meses: 0 })).toBeNull();
    expect(cotizar(100, { ...p, rendimientoPct: Number.NaN })).toBeNull();
    expect(productoValido({ id: 'x', nombre: 'Sin plazo', meses: 1.5, rendimientoPct: 10 })).toBe(false);
  });
});
