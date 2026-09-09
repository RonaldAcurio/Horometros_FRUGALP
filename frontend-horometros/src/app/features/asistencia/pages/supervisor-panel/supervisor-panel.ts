import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { Asistencia } from '../../../../core/models/asistencia.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-supervisor-panel',
  styleUrl: './supervisor-panel.css',
  templateUrl: './supervisor-panel.html',
})
export class SupervisorPanel implements OnInit {
  asistenciasHoy: Asistencia[] = [];
  fechaSeleccionada: string = '';

  //Edicion de observacion
  observacionEditandoId: number | null=null;
  observacionTexto: string = '';

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarAsistencias();
  }

  cargarAsistencias(): void {
    this.asistenciaService.obtenerAsistenciasHoy(this.fechaSeleccionada || undefined).subscribe({
      next: (data: any) => {
        this.asistenciasHoy = Array.isArray(data) ? data : data?.data || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando asistencias:', err)
    });
  }

  onCambioFEcha():void{
    this.cargarAsistencias();
  }

  ejecutarCierreDiario(): void {

    const etiquetaFEcha = this.fechaSeleccionada || 'la jornada de hoy';

    if (confirm(`¿Desea realizar el cierre diario de ${etiquetaFEcha}?`)) {
      this.asistenciaService.finalizarDia(this.fechaSeleccionada || undefined).subscribe({
        next: (res) => {
          alert(res.message || 'Cierre de jornada completado.');
          this.cargarAsistencias();
        },
        error: () => alert('Error procesando el cierre de día.')
      });
    }
  }

  //Observaciones de SUPERVISOR
  abrirObservacion(asis:Asistencia):void{
    this.observacionEditandoId = asis.id;
    this.observacionTexto = asis.observaciones || '';
  }

  guardarObservacion():void{
    if(this.observacionEditandoId == null) return;

    this.asistenciaService.revisarAsistencia(this.observacionEditandoId, {
      observaciones: this.observacionTexto
    }). subscribe({
      next: () => {
        this.cerrarObservacion();
        this.cargarAsistencias();
      },
      error: () => alert('Error al guardar la observacion.')
    });
  }

  cerrarObservacion():void{
    this.observacionEditandoId = null;
    this.observacionTexto = '';
  }
}
