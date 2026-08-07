import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import {
  FORMAS_PAGO_606,
  TIPOS_BIENES_SERVICIOS_606,
  TIPOS_IDENTIFICACION,
  TIPOS_INGRESO_607,
  TIPOS_NCF,
} from '../dgii';

/**
 * Catálogos oficiales de la DGII, servidos desde el backend para que el
 * frontend no mantenga un espejo que se desincroniza.
 *
 * Se devuelven las descripciones oficiales completas: acortarlas aquí sería
 * decidir por el cliente. La UI renderiza `${codigo} · ${descripcion}` y trunca
 * por CSS.
 */
@Auth()
@Controller('catalogos')
export class CatalogosController {
  @Get()
  findAll() {
    return {
      tiposIdentificacion: TIPOS_IDENTIFICACION,
      tiposIngreso607: TIPOS_INGRESO_607,
      tiposBienesServicios606: TIPOS_BIENES_SERVICIOS_606,
      formasPago606: FORMAS_PAGO_606,
      tiposNcf: TIPOS_NCF,
      // Ojo: TIPOS_NCF_NOTA_CREDITO queda fuera a propósito — es un Set y
      // JSON.stringify lo serializa como {}. El frontend lo deriva de tiposNcf.
    };
  }
}
