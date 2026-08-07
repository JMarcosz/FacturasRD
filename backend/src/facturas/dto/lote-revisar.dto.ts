import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class LoteRevisarDto {
  // 500 es el tope de una selección razonable en la tabla; por encima de eso
  // el `IN (...)` deja de ser barato y conviene filtrar mejor.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @IsBoolean()
  revisada!: boolean;
}
