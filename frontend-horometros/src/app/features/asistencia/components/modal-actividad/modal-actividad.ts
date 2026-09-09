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
  @Output() seleccionar = new EventEmitter<number[]>();
  @Output() cancelar = new EventEmitter<void>();

  actividades: any[] = [];
  actividadSeleccionadaIds: number[] = [];

  constructor(private asistenciaService: AsistenciaService) {}

  ngOnInit(): void {
    this.asistenciaService.obtenerActividades().subscribe({
      next: (data) => {
        this.actividades = Array.isArray(data) ? data : (data as any)?.data || [];
      },
      error: (err) => console.error('Error cargando actividades:', err)
    });
  }

  //Marca o desmarca una actividad dentro de la seleccion multiple
  toggleActividad(id:number, marcada:boolean): void {
    if(marcada){
      if(!this.actividadSeleccionadaIds.includes(id)){
        this.actividadSeleccionadaIds.push(id);
      }
    } else{
      this.actividadSeleccionadaIds = this.actividadSeleccionadaIds.filter(actId => actId !== id);
    }
  }

  confirmar(): void {
    if (this.actividadSeleccionadaIds.length > 0) {
      this.seleccionar.emit(this.actividadSeleccionadaIds);
      this.actividadSeleccionadaIds = [];
    }
  }

  cerrar(): void {
    this.actividadSeleccionadaIds = [];
    this.cancelar.emit();
  }
}
