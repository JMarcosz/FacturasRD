import { IsIn, IsUUID } from 'class-validator';

export class ClasificarFacturaDto {
  @IsUUID()
  clienteId!: string;

  @IsIn(['F606', 'F607'])
  formato!: 'F606' | 'F607';
}
