import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface EventoDocumento {
  tipo: 'PROCESANDO' | 'EXTRAIDO' | 'ERROR' | 'SUBIDO';
  documentoId?: string;
  facturaId?: string;
}

@Injectable()
export class DocumentosEventosService {
  private readonly subject = new Subject<EventoDocumento>();

  emitir(evento: EventoDocumento) {
    this.subject.next(evento);
  }

  obtenerObservable(): Observable<EventoDocumento> {
    return this.subject.asObservable();
  }
}
