import { describe, expect, it } from 'vitest';
import { centsToPlainPesos, formatDate, formatDateTime, formatMXN, formatMonthTick, formatRateBps, todayInContractZone } from './format';
import { mexicoCityLocalToIso, parsePercentToBps, parsePesosToCents } from './parse';

describe('formatMXN (centavos enteros → texto, sin flotantes)', () => {
  it('formatea montos típicos', () => {
    expect(formatMXN(15000050)).toBe('$150,000.50');
    expect(formatMXN(0)).toBe('$0.00');
    expect(formatMXN(1)).toBe('$0.01');
    expect(formatMXN(100)).toBe('$1.00');
    expect(formatMXN(50_000_000, { withCode: true })).toBe('$500,000.00 MXN');
  });
  it('maneja negativos (ajustes y contra-asientos)', () => {
    expect(formatMXN(-536986)).toBe('-$5,369.86');
  });
  it('no pierde precisión con montos grandes', () => {
    expect(formatMXN('900719925474099199')).toBe('$9,007,199,254,740,991.99');
  });
  it('rechaza valores no enteros o vacíos', () => {
    expect(formatMXN(10.5)).toBe('—');
    expect(formatMXN(null)).toBe('—');
    expect(formatMXN('abc')).toBe('—');
  });
  it('centsToPlainPesos sirve para rellenar campos', () => {
    expect(centsToPlainPesos(583333)).toBe('5833.33');
    expect(centsToPlainPesos(5)).toBe('0.05');
  });
});

describe('formatRateBps', () => {
  it('convierte puntos básicos a porcentaje', () => {
    expect(formatRateBps(1400)).toBe('14.00 %');
    expect(formatRateBps(1425)).toBe('14.25 %');
    expect(formatRateBps(5)).toBe('0.05 %');
  });
});

describe('fechas', () => {
  it('no corre un día las fechas contractuales (YYYY-MM-DD)', () => {
    expect(formatDate('2026-01-15')).toBe('15 ene 2026');
    expect(formatDate('2026-01-01', 'long')).toBe('1 de enero de 2026');
    expect(formatDate('2024-02-29')).toBe('29 feb 2024');
    expect(formatDate('2026-12-31')).toBe('31 dic 2026');
  });
  it('convierte marcas UTC a hora de Ciudad de México', () => {
    // 03:30 UTC del 16 de feb = 21:30 del 15 de feb en CDMX (UTC-6)
    expect(formatDateTime('2026-02-16T03:30:00Z')).toMatch(/15 feb 2026.*21:30/);
    // Formato SQLite datetime('now') se interpreta como UTC
    expect(formatDateTime('2026-02-16 03:30:00')).toMatch(/15 feb 2026.*21:30/);
  });
  it('etiquetas de eje cortas', () => {
    expect(formatMonthTick('2026-03-15')).toBe('mar 26');
  });
  it('“hoy” se calcula en el huso contractual', () => {
    expect(todayInContractZone(new Date('2026-10-15T04:00:00Z'))).toBe('2026-10-14');
  });
});

describe('captura del administrador', () => {
  it('pesos → centavos sin flotantes', () => {
    expect(parsePesosToCents('150,000.50')).toBe(15000050);
    expect(parsePesosToCents('$1,000')).toBe(100000);
    expect(parsePesosToCents('0.1')).toBe(10);
    expect(parsePesosToCents('12.345')).toBeNull();
    expect(parsePesosToCents('-10')).toBeNull();
    expect(parsePesosToCents('-10.25', { allowNegative: true })).toBe(-1025);
    expect(parsePesosToCents('abc')).toBeNull();
  });
  it('porcentaje → puntos básicos', () => {
    expect(parsePercentToBps('14')).toBe(1400);
    expect(parsePercentToBps('14.25 %')).toBe(1425);
    expect(parsePercentToBps('14.5')).toBe(1450);
    expect(parsePercentToBps('14.255')).toBeNull();
  });
  it('fecha/hora de CDMX → ISO UTC', () => {
    expect(mexicoCityLocalToIso('2026-03-16', '08:30')).toBe('2026-03-16T14:30:00.000Z');
    expect(mexicoCityLocalToIso('2026-3-16', '08:30')).toBeNull();
  });
});
