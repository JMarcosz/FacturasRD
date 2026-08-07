import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ImportarClientesDto } from './dto/importar-clientes.dto';

@Auth()
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Post('importar')
  importar(@Body() dto: ImportarClientesDto) {
    return this.clientesService.importarClientes(dto.filas);
  }

  @Get()
  findAll(@Query('incluirInactivos') incluirInactivos?: string) {
    return this.clientesService.findAll(incluirInactivos === 'true');
  }

  @Get('duplicados')
  detectarDuplicados() {
    return this.clientesService.detectarDuplicados();
  }

  @Post('fusionar')
  fusionar(@Body() body: { idPrincipal: string; idsSecundarios: string[] }) {
    return this.clientesService.fusionar(body.idPrincipal, body.idsSecundarios);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(id, dto);
  }

  @Patch(':id/confirmar')
  confirmar(@Param('id') id: string, @Body() body: { tipoIngresoDefault?: string }) {
    return this.clientesService.confirmar(id, body.tipoIngresoDefault);
  }

  @Patch(':id/descartar')
  descartar(@Param('id') id: string) {
    return this.clientesService.descartar(id);
  }

  @Post(':id/reclasificar')
  reclasificar(@Param('id') id: string) {
    return this.clientesService.reclasificarFacturas(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientesService.remove(id);
  }
}
