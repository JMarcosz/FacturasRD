import { TipoIdentificacion } from './types';

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Dígito verificador de RNC (9 dígitos), algoritmo Módulo 11 de la DGII:
 * pesos [7,9,8,6,5,4,3,2] sobre los primeros 8 dígitos.
 * residuo 0 → dígito 2 · residuo 1 → dígito 1 · en otro caso → 11 - residuo.
 */
const PESOS_RNC = [7, 9, 8, 6, 5, 4, 3, 2];

export function calcularDigitoVerificadorRnc(base8: string): number {
  const suma = base8
    .split('')
    .reduce((acc, d, i) => acc + parseInt(d, 10) * PESOS_RNC[i], 0);
  const residuo = suma % 11;
  if (residuo === 0) return 2;
  if (residuo === 1) return 1;
  return 11 - residuo;
}

export function validarRnc(valor: string): boolean {
  const d = soloDigitos(valor);
  if (d.length !== 9) return false;
  return calcularDigitoVerificadorRnc(d.slice(0, 8)) === parseInt(d[8], 10);
}

/**
 * Dígito verificador de Cédula (11 dígitos), variante Luhn usada por la DGII:
 * pesos alternos [1,2] sobre los primeros 10 dígitos; si el producto es >= 10
 * se suman sus propios dígitos (equivalente a restar 9).
 */
const PESOS_CEDULA = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];

export function calcularDigitoVerificadorCedula(base10: string): number {
  const suma = base10.split('').reduce((acc, d, i) => {
    let producto = parseInt(d, 10) * PESOS_CEDULA[i];
    if (producto >= 10) producto = Math.floor(producto / 10) + (producto % 10);
    return acc + producto;
  }, 0);
  const modulo = suma % 10;
  return modulo === 0 ? 0 : 10 - modulo;
}

export function validarCedula(valor: string): boolean {
  const d = soloDigitos(valor);
  if (d.length !== 11) return false;
  return calcularDigitoVerificadorCedula(d.slice(0, 10)) === parseInt(d[10], 10);
}

/**
 * Determina el tipo de identificación por longitud (9 = RNC, 11 = Cédula) y,
 * si no calza con ninguna, se asume Pasaporte (alfanumérico, sin checksum
 * conocido en RD). No valida el checksum aquí — eso lo hace `validarRnc`/
 * `validarCedula` por separado para poder reportar el error específico.
 */
export function detectarTipoIdentificacion(valor: string): TipoIdentificacion {
  const d = soloDigitos(valor);
  if (d.length === 9) return '1';
  if (d.length === 11) return '2';
  return '3';
}

/**
 * Reduce una identificación a solo sus dígitos. Es la forma canónica para
 * COMPARAR (buscar el cliente por RNC, detectar duplicados): "1-30-12345-4" y
 * "130123454" son el mismo contribuyente.
 *
 * No sirve para guardar: un pasaporte es alfanumérico y aquí se quedaría sin
 * letras. Para eso está `limpiarIdentificacion`.
 */
export function normalizarIdentificacion(valor: string): string {
  return soloDigitos(valor);
}

/**
 * El lado de la transacción que efectivamente se declara al DGII: emisor en
 * 606 (compra — el proveedor), receptor en 607 (venta — el comprador). No es
 * una columna propia (la factura ya no guarda `rncCedula`): se deriva en
 * vivo de `formato` + los dos lados extraídos, para no tener dos campos
 * guardando el mismo dato desde perspectivas distintas.
 */
export function identificacionDeclarada(
  formato: 'F606' | 'F607' | null,
  f: { identificacionEmisor: string | null; identificacionReceptor: string | null },
): string {
  if (formato === 'F607') return f.identificacionReceptor ?? '';
  if (formato === 'F606') return f.identificacionEmisor ?? '';
  return '';
}

/**
 * Deja la identificación como debe GUARDARSE: sin los separadores que el OCR
 * arrastra del papel (guiones, puntos, espacios, barras) pero conservando las
 * letras, porque un pasaporte las lleva y es una identificación válida ante la
 * DGII (tipo "3").
 *
 * Sin esto, el mismo RNC entraba como "130-12345-4" desde una factura y como
 * "130123454" desde otra: dos textos distintos para el mismo contribuyente,
 * que es de donde salen los "casi duplicados".
 */
export function limpiarIdentificacion(valor: string | null | undefined): string {
  return (valor ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}
