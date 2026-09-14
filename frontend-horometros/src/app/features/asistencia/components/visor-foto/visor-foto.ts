import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AsistenciaService } from '../../../../core/services/asistencia.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-visor-foto',
  styleUrl: './visor-foto.css',
  templateUrl: './visor-foto.html',
})
export class VisorFoto {
  /*
  Ya no recibimos la foto en si: solo el ID del registro y si tiene foto o no(un booleano liviano que manda el backend)
  La imagen real se pude recien cuando el usuario hace clic en "Ver Evidencia" - asi los listados (Historial/Paner de Supervisor)
  no cargan de entrada las fotos de registros, solo la de la que realmente quiera ver.
  */
  @Input() asistenciaId: number | null = null;
  @Input() tieneFoto: boolean = false;

  mostrarModal: boolean = false;
  cargando: boolean = false;
  fotoUrl: string | null = null;
  error: string = '';

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr : ChangeDetectorRef
  ) {}

  abrir(): void {
    if(!this.tieneFoto || this.asistenciaId == null){
      return;
    }

    this.mostrarModal = true;
    this.cargando = true;
    this.error = '';
    this.fotoUrl = null;
    this.cdr.detectChanges();

    this.asistenciaService.obtenerFotoAsistencia(this.asistenciaId).subscribe({
      next:(res)=>{
        this.fotoUrl = res.foto_ingreso;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: ()=>{
        this.error = 'No se puede cargar la evidencia. Intente nuevamente.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  cerrar():void{
    this.mostrarModal = false;
    this.fotoUrl = null;
    this.cdr.detectChanges();
  }
}
