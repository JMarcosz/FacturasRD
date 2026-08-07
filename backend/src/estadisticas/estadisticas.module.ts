import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EstadisticasController } from './estadisticas.controller';
import { EstadisticasService } from './estadisticas.service';

// PrismaModule es @Global(), así que basta con AuthModule para el @Auth().
@Module({
  imports: [AuthModule],
  controllers: [EstadisticasController],
  providers: [EstadisticasService],
})
export class EstadisticasModule {}
