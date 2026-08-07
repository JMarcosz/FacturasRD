import { IsBoolean } from 'class-validator';

export class MarcarRevisadaDto {
  @IsBoolean()
  revisada!: boolean;
}
