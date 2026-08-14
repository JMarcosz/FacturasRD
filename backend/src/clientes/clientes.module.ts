import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExtraccionModule } from '../extraccion/extraccion.module';
import { SugerenciasModule } from '../sugerencias/sugerencias.module';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  imports: [AuthModule, forwardRef(() => ExtraccionModule), SugerenciasModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
