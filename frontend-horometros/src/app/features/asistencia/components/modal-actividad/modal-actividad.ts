import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from  '../../../../core/services/asistencia.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-modal-actividad',
  styleUrl: './modal-actividad.css',
  templateUrl: './modal-actividad.html',
})
export class ModalActividad {
  @Input() mostrar: boolean = false;
  @Output() seleccionar = new EventEmitter<number>();
  @Output() cancelar = new EventEmitter<void>();

  actividades: any[] = [];
  actividadSeleccionadaId: number | null = null;

  constructor(private asistenciaService: AsistenciaService) {}

  ngOnInit(): void {
    this.asistenciaService.obtenerActividades().subscribe({
      next: (data) => {
        this.actividades = Array.isArray(data) ? data : (data as any)?.data || [];
      },
      error: (err) => console.error('Error cargando actividades:', err)
    });
  }

  confirmar(): void {
    if (this.actividadSeleccionadaId) {
      this.seleccionar.emit(this.actividadSeleccionadaId);
      this.actividadSeleccionadaId = null;
    }
  }

  cerrar(): void {
    this.actividadSeleccionadaId = null;
    this.cancelar.emit();
  }
}
