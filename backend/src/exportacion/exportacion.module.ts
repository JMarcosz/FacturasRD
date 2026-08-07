import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExportacionController } from './exportacion.controller';
import { ReporteriaController } from './reporteria.controller';
import { ExportacionService } from './exportacion.service';

@Module({
  imports: [AuthModule],
  controllers: [ExportacionController, ReporteriaController],
  providers: [ExportacionService],
})
export class ExportacionModule {}
