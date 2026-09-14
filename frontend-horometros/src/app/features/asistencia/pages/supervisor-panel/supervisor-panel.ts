import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { Asistencia } from '../../../../core/models/asistencia.model';
import { VisorFoto } from '../../components/visor-foto/visor-foto';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, VisorFoto],
  selector: 'app-supervisor-panel',
  styleUrl: './supervisor-panel.css',
  templateUrl: './supervisor-panel.html',
})
export class SupervisorPanel implements OnInit {
  asistenciasHoy: Asistencia[] = [];
  fechaSeleccionada: string = '';

  //Paginacion del dia: el backend nunca manda de golpe todos los registros del dia
  paginaHoy:number = 1;
  totalPaginasHoy: number= 1;
  total:number = 0;

  /*
  Verdadero cuando TODOS los registros del dia (no solo la pagina visible) ya fueron cerrador por el Supervisor (FINALIZADO o SALIDA_OLVIDADA).
  Lo calcula el backend sobre el dia completo, por eso ya NO es un getter derivado de "asistenciasHoy" -- si lo fuera, el boton "Cerrar Jornada"
  pondria mal segun que pagina se este mirando.
  */
  diaCerrado:boolean = false;

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
    this.asistenciaService.obtenerAsistenciasHoy(this.fechaSeleccionada || undefined, this.paginaHoy, 30).subscribe({
      next: (res) => {
        this.asistenciasHoy = res.data || [];
        this.totalPaginasHoy = res.totalPaginas || 1;
        this.diaCerrado = res.diaCerrado;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando asistencias:', err)
    });
  }

  onCambioFecha():void{
    this.paginaHoy = 1;
    this.cargarAsistencias();
  }

  /*
  Verdadero cuando TODOS los registros del dia mostrado ya fueron cerrados por el SUPERVUISOR(FINALIZADO o SALIDA_OLVIDADA).
  Si no hay registro todavia, no se considera "cerrado".
  */
 cambiarPaginaHoy(nuevaPagina:number): void{
  if(nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasHoy){
    this.paginaHoy = nuevaPagina;
    this.cargarAsistencias();
  }
 }

  ejecutarCierreDiario(): void {

    //Guarda defensiva: el boton ya se deshabilita en el HTML cuando el dia esta cerrado,
    //pero validamos aca tambien por si se llega a disparar el click de otra forma.
    if(this.diaCerrado){
      alert('Esta jornada ya fue cerrada anteriormente.');
      return;
    }

    const etiquetaFEcha = this.fechaSeleccionada || 'la jornada de hoy';

    if (confirm(`¿Desea realizar el cierre diario de ${etiquetaFEcha}? Los datos quedaran congelados y no se podran modificar.`)) {
      this.asistenciaService.finalizarDia(this.fechaSeleccionada || undefined).subscribe({
        next: (res) => {
          alert(res.message || 'Cierre de jornada completado.');
          this.cargarAsistencias();
        },
        error: (err) => alert(err.error?.message || 'Error procesando el cierre de día.')
      });
    }
  }

  //Observaciones de SUPERVISOR
  abrirObservacion(asis:Asistencia):void{
    //Datos congelados: si el registro ya fue cerrado, no se abre el formulario de edicion
    if(asis.estado === 'FINALIZADO' || asis.estado === 'SALIDA_OLVIDADA'){
      alert('Este registro ya fue cerrado y no se puede modificar.');
      return;
    }

    this.observacionEditandoId = asis.id;
    this.observacionTexto = asis.observaciones || '';
    this.cdr.detectChanges();
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
      error: (err) => alert(err.error?.message || 'Error al guardar la observacion.')
    });
  }

  cerrarObservacion():void{
    this.observacionEditandoId = null;
    this.observacionTexto = '';
    this.cdr.detectChanges();
  }
}
