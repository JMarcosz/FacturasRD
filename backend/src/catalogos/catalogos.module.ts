import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogosController } from './catalogos.controller';

// Sin servicio: los catálogos son constantes de `dgii/catalogos.ts`, no hay
// estado ni acceso a base de datos que encapsular.
@Module({
  imports: [AuthModule],
  controllers: [CatalogosController],
})
export class CatalogosModule {}
