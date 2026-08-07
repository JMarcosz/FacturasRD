import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExtraccionModule } from '../extraccion/extraccion.module';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';

@Module({
  imports: [AuthModule, ExtraccionModule],
  controllers: [FacturasController],
  providers: [FacturasService],
  exports: [FacturasService],
})
export class FacturasModule {}
