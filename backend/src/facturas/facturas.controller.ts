import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { FacturasService } from './facturas.service';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { MarcarRevisadaDto } from './dto/marcar-revisada.dto';
import { ClasificarFacturaDto } from './dto/clasificar-factura.dto';
import { ListarFacturasQueryDto } from './dto/listar-facturas-query.dto';
import { LoteRevisarDto } from './dto/lote-revisar.dto';
import { LoteCamposDto } from './dto/lote-campos.dto';
import { LoteEliminarDto } from './dto/lote-eliminar.dto';
import { LoteIdsDto } from './dto/lote-ids.dto';

@Auth()
@Controller()
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  @Get('facturas')
  findAll(@Query() query: ListarFacturasQueryDto) {
    return this.facturasService.findAll(query);
  }

  @Get('periodos/:periodoId/facturas')
  findAllByPeriodo(@Param('periodoId') periodoId: string) {
    return this.facturasService.findAllByPeriodo(periodoId);
  }

  // Las rutas de lote llevan dos segmentos (`facturas/lote/...`) a propósito:
  // así nunca colisionan con `facturas/:id` y no dependen del orden de
  // declaración de los métodos.

  @Patch('facturas/lote/revisar')
  marcarRevisadaLote(@Body() dto: LoteRevisarDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.marcarRevisadaLote(dto.ids, dto.revisada, user.userId);
  }

  @Patch('facturas/lote/campos')
  actualizarCamposLote(@Body() dto: LoteCamposDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.actualizarCamposLote(dto, user.userId);
  }

  // POST y no DELETE porque lleva cuerpo: varios proxies e intermediarios
  // descartan el body de un DELETE.
  @Post('facturas/lote/eliminar')
  eliminarLote(@Body() dto: LoteEliminarDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.eliminarLote(dto.ids, user.userId);
  }

  @Patch('facturas/lote/confirmar')
  confirmarLote(@Body() dto: LoteIdsDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.confirmarClasificacionLote(dto.ids, user.userId);
  }

  @Get('facturas/:id')
  findOne(@Param('id') id: string) {
    return this.facturasService.findOne(id);
  }

  @Patch('facturas/:id')
  update(@Param('id') id: string, @Body() dto: UpdateFacturaDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.update(id, dto, user.userId);
  }

  @Patch('facturas/:id/clasificar')
  clasificar(@Param('id') id: string, @Body() dto: ClasificarFacturaDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.clasificar(id, dto, user.userId);
  }

  @Patch('facturas/:id/revisar')
  marcarRevisada(@Param('id') id: string, @Body() dto: MarcarRevisadaDto, @CurrentUser() user: AuthUser) {
    return this.facturasService.marcarRevisada(id, dto.revisada, user.userId);
  }

  @Delete('facturas/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.facturasService.remove(id, user.userId);
  }
}
