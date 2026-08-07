import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import { ListarFacturasQueryDto } from '../facturas/dto/listar-facturas-query.dto';
import { EstadisticasService } from './estadisticas.service';
import { ResumenQueryDto } from './dto/resumen-query.dto';

@Auth()
@Controller('estadisticas')
export class EstadisticasController {
  constructor(private readonly estadisticasService: EstadisticasService) {}

  @Get('resumen')
  resumen(@Query() query: ResumenQueryDto) {
    return this.estadisticasService.resumen(query);
  }

  // Mismos filtros que `GET /facturas` — a propósito: son los KPIs de esa
  // misma pantalla y tienen que cuadrar con las filas que se ven.
  @Get('facturas')
  porFiltro(@Query() query: ListarFacturasQueryDto) {
    return this.estadisticasService.porFiltro(query);
  }
}
