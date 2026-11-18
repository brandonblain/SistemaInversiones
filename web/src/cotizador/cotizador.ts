// Cotizador (/cotizador): configuración única de productos y cálculo de la estimación.
// Para cambiar plazos o rendimientos, editar solo PRODUCTOS_COTIZADOR.

export interface ProductoCotizador {
  id: string;
  nombre: string;
  /** Plazo del contrato en meses. */
  meses: number;
  /** Rendimiento TOTAL del plazo (no anual), en %. Admite hasta 2 decimales. Sin interés compuesto. */
  rendimientoPct: number;
}

export const PRODUCTOS_COTIZADOR: readonly ProductoCotizador[] = [
  { id: 'computo', nombre: 'Arrendamiento de cómputo', meses: 12, rendimientoPct: 12 },
  { id: 'rampas', nombre: 'Rampas de vehículos', meses: 24, rendimientoPct: 27 },
  { id: 'utilitarios', nombre: 'Autos utilitarios', meses: 24, rendimientoPct: 26 },
  { id: 'electrico', nombre: 'Transporte eléctrico', meses: 12, rendimientoPct: 15 },
  { id: 'tecnologia', nombre: 'Tecnología y Desarrollo', meses: 12, rendimientoPct: 10 },
  { id: 'franquicias', nombre: 'Desarrollo Franquicias', meses: 18, rendimientoPct: 17 }
];

/** Capital máximo cotizable: $1,000,000,000.00 (mantiene los cálculos en centavos enteros exactos). */
export const CAPITAL_MAXIMO_CENTS = 100_000_000_000;

/** Un producto es válido si tiene plazo entero positivo y un rendimiento positivo con hasta 2 decimales. */
export function productoValido(p: ProductoCotizador): boolean {
  return (
    !!p.id &&
    !!p.nombre &&
    Number.isInteger(p.meses) &&
    p.meses > 0 &&
    Number.isFinite(p.rendimientoPct) &&
    p.rendimientoPct > 0 &&
    Math.abs(p.rendimientoPct * 100 - Math.round(p.rendimientoPct * 100)) < 1e-9
  );
}

/** Productos que se muestran: una configuración incompleta nunca llega a la pantalla ni al cálculo. */
export const PRODUCTOS = PRODUCTOS_COTIZADOR.filter(productoValido);

export interface Cotizacion {
  capitalCents: number;
  gananciaCents: number;
  capitalFinalCents: number;
  rendimientoPct: number;
  meses: number;
  /** Capital estimado mes a mes (0 … meses), lineal y proporcional al rendimiento total. */
  serie: Array<{ mes: number; capitalCents: number }>;
}

/**
 * Ganancia = Capital × (Porcentaje / 100) · Capital final = Capital + Ganancia.
 * Todo en centavos enteros: el porcentaje se convierte a puntos básicos (12 % → 1200) para no arrastrar
 * errores de punto flotante; el redondeo es al centavo más cercano.
 */
export function cotizar(capitalCents: number, producto: ProductoCotizador): Cotizacion | null {
  if (!Number.isInteger(capitalCents) || capitalCents <= 0 || capitalCents > CAPITAL_MAXIMO_CENTS || !productoValido(producto)) return null;
  const bps = Math.round(producto.rendimientoPct * 100);
  const gananciaCents = Math.round((capitalCents * bps) / 10_000);
  const serie = Array.from({ length: producto.meses + 1 }, (_, mes) => ({
    mes,
    capitalCents: capitalCents + Math.round((gananciaCents * mes) / producto.meses)
  }));
  return { capitalCents, gananciaCents, capitalFinalCents: capitalCents + gananciaCents, rendimientoPct: producto.rendimientoPct, meses: producto.meses, serie };
}
