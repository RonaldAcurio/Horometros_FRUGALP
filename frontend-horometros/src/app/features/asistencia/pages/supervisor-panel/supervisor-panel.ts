import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { Asistencia } from '../../../../core/models/asistencia.model';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-supervisor-panel',
  styleUrl: './supervisor-panel.css',
  templateUrl: './supervisor-panel.html',
})
export class SupervisorPanel {
  asistenciasHoy: Asistencia[] = [];

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarAsistenciasHoy();
  }

  cargarAsistenciasHoy(): void {
    this.asistenciaService.obtenerAsistenciasHoy().subscribe({
      next: (data: any) => {
        this.asistenciasHoy = Array.isArray(data) ? data : data?.data || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando asistencias:', err)
    });
  }

  ejecutarCierreDiario(): void {
    if (confirm('¿Desea realizar el cierre diario de jornada?')) {
      this.asistenciaService.finalizarDia().subscribe({
        next: (res) => {
          alert(res.message || 'Cierre de jornada completado.');
          this.cargarAsistenciasHoy();
        },
        error: () => alert('Error procesando el cierre de día.')
      });
    }
  }
}
