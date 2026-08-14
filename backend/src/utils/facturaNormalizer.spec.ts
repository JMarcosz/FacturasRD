import { aplicarFallbackRncServicios, normalizarNombreEntidad } from './facturaNormalizer';

describe('Factura Normalizer & RNC Fallback Interceptor', () => {
  describe('normalizarNombreEntidad', () => {
    it('elimina tildes, signos de puntuación y mayúsculas', () => {
      expect(
        normalizarNombreEntidad('Compañía Dominicana de Teléfonos, S.A.'),
      ).toBe('COMPANIA DOMINICANA DE TELEFONOS S A');
      expect(
        normalizarNombreEntidad('Empresa Distribuidora de Electricidad del Este, S.A.'),
      ).toBe('EMPRESA DISTRIBUIDORA DE ELECTRICIDAD DEL ESTE S A');
    });
  });

  describe('aplicarFallbackRncServicios', () => {
    it('respeta y retorna inmediatamente si ya existe un RNC válido de 9 dígitos (Early Return)', () => {
      const rncExistente = '131044842';
      expect(
        aplicarFallbackRncServicios('Distribuidora de Electricidad del Este', rncExistente),
      ).toBe('131044842');
    });

    it('recupera RNC de Claro para múltiples variantes de nombre', () => {
      expect(
        aplicarFallbackRncServicios('Compañía Dominicana de Teléfonos, S.A.', null),
      ).toBe('101001577');
      expect(
        aplicarFallbackRncServicios('Claro Dominicana', null),
      ).toBe('101001577');
      expect(
        aplicarFallbackRncServicios('CLARO', ''),
      ).toBe('101001577');
    });

    it('recupera RNC de EDEESTE, EDESUR y EDENORTE', () => {
      expect(
        aplicarFallbackRncServicios('Empresa Distribuidora de Electricidad del Este, S.A.', null),
      ).toBe('101797931');
      expect(
        aplicarFallbackRncServicios('EDEESTE', null),
      ).toBe('101797931');
      expect(
        aplicarFallbackRncServicios('Edesur Dominicana S.A.', null),
      ).toBe('101618787');
      expect(
        aplicarFallbackRncServicios('Edenorte', null),
      ).toBe('101788223');
    });

    it('recupera RNC de CAASD, CORAASAN y Altice', () => {
      expect(
        aplicarFallbackRncServicios('CAASD', null),
      ).toBe('401007455');
      expect(
        aplicarFallbackRncServicios('Corporación del Acueducto y Alcantarillado de Santo Domingo', null),
      ).toBe('401007455');
      expect(
        aplicarFallbackRncServicios('Altice Dominicana', null),
      ).toBe('130983196');
      expect(
        aplicarFallbackRncServicios('Orange Dominicana', null),
      ).toBe('130983196');
    });

    it('retorna null para comercios no conocidos que no tengan RNC', () => {
      expect(
        aplicarFallbackRncServicios('Panadería El Buen Gusto SRL', null),
      ).toBeNull();
    });
  });
});
