import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { HaciendaService } from '../../../../core/services/hacienda.service';
import { UsuarioService } from '../../../../core/services/usuario.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Asistencia } from '../../../../core/models/asistencia.model';
import { Hacienda } from '../../../../core/models/hacienda.model';
import { Usuario } from '../../../../core/models/usuario.model';
import { VisorFoto } from '../../components/visor-foto/visor-foto';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, VisorFoto],
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
  totalHoy:number = 0;

  /*
  Verdadero cuando TODOS los registros del dia (no solo la pagina visible) ya no siguen EN_JORNADA/PENDIENTE_REVISION
  Y ademas el Supervisor ya confirmo O/X a todos (ver calcularDiaCerrado en el backend - un trabajador puede
  autocerrarse solo, pero eso NO cuenta como "dia cerrado" sin la confirmacion). Tambien controla si se puede
  editar la Observación de cada fila (`abrirObservacion`) - a nivel de DIA completo, no del estado de cada
  registro puntual. Lo calcula el backend sobre el dia completo, por eso ya NO es un getter derivado de
  "asistenciasHoy" -- si lo fuera, el boton "Cerrar Jornada" pondria mal segun que pagina se este mirando.
  */
  diaCerrado:boolean = false;

  //Edicion de observacion
  observacionEditandoId: number | null=null;
  observacionTexto: string = '';

  // Token de Hacienda: cada Supervisor solo ve/genera el de SU PROPIA hacienda (perfil().hacienda_id),
  // independiente de las demas - no hay selector, no puede tocar el de otra hacienda (ver CLAUDE.md).
  miHacienda: Hacienda | null = null;

  // Filtro por Supervisor: solo tiene sentido para ADMIN (ver esAdmin abajo) - un Supervisor real ya ve todo
  // mezclado en esta misma pantalla (deuda tecnica heredada, no filtra por hacienda propia, ver CLAUDE.md), asi
  // que dejarlo elegir OTRO supervisor no tendria sentido de negocio.
  supervisores: Usuario[] = [];
  supervisorIdFiltro: number | null = null;
  get esAdmin(): boolean {
    return this.authService.tieneRol('ADMIN');
  }

  constructor(
    private asistenciaService: AsistenciaService,
    private haciendaService: HaciendaService,
    private usuarioService: UsuarioService,
    protected authService: AuthService,
    private cdr: ChangeDetectorRef,
    private notificacionService: NotificacionService,
    private confirmacionService: ConfirmacionService
  ) {}

  ngOnInit(): void {
    this.cargarAsistencias();
    this.cargarMiHacienda();
    if (this.esAdmin) this.cargarSupervisores();
  }

  cargarSupervisores(): void {
    this.usuarioService.obtenerUsuarios().subscribe({
      next: (data) => {
        this.supervisores = data.filter((u) => u.cargo === 'SUPERVISOR');
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando supervisores:', err),
    });
  }

  onCambioSupervisor(): void {
    this.paginaHoy = 1;
    this.cargarAsistencias();
  }

  cargarMiHacienda(): void {
    const haciendaId = this.authService.perfil()?.hacienda_id;
    if (!haciendaId) return;

    this.haciendaService.obtenerHaciendas().subscribe({
      next: (haciendas) => {
        this.miHacienda = haciendas.find((h) => h.id === haciendaId) || null;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando la hacienda del supervisor:', err),
    });
  }

  generarMiToken(): void {
    if (!this.miHacienda) return;

    this.haciendaService.generarToken(this.miHacienda.id).subscribe({
      next: (res) => {
        this.miHacienda!.token_actual = res.token_actual;
        this.miHacienda!.token_expira_en = res.token_expira_en;
        this.notificacionService.exito('Token generado. Vigente 24h.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al generar el token.');
        this.cdr.detectChanges();
      },
    });
  }

  async invalidarMiToken(): Promise<void> {
    if (!this.miHacienda) return;

    const confirmado = await this.confirmacionService.preguntar(
      '¿Invalidar el token actual? Los puntos de control que lo usen dejarán de poder marcar hasta que generes uno nuevo.',
      'Invalidar token'
    );
    if (!confirmado) return;

    this.haciendaService.invalidarToken(this.miHacienda.id).subscribe({
      next: () => {
        this.miHacienda!.token_actual = null;
        this.miHacienda!.token_expira_en = null;
        this.notificacionService.exito('Token invalidado.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al invalidar el token.');
        this.cdr.detectChanges();
      },
    });
  }

  cargarAsistencias(): void {
    this.asistenciaService.obtenerAsistenciasHoy(this.fechaSeleccionada || undefined, this.paginaHoy, 30, this.supervisorIdFiltro || undefined).subscribe({
      next: (res) => {
        this.asistenciasHoy = res.data || [];
        this.totalPaginasHoy = res.totalPaginas || 1;
        this.totalHoy = res.total || 0;
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

 cambiarPaginaHoy(nuevaPagina:number): void{
  if(nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasHoy){
    this.paginaHoy = nuevaPagina;
    this.cargarAsistencias();
  }
 }

  async ejecutarCierreDiario(): Promise<void> {

    //Guarda defensiva: el boton ya se deshabilita en el HTML cuando el dia esta cerrado,
    //pero validamos aca tambien por si se llega a disparar el click de otra forma.
    if(this.diaCerrado){
      this.notificacionService.advertencia('Esta jornada ya fue cerrada anteriormente.');
      return;
    }

    const etiquetaFEcha = this.fechaSeleccionada || 'la jornada de hoy';

    const confirmado = await this.confirmacionService.preguntar(
      `¿Desea realizar el cierre diario de ${etiquetaFEcha}? Los datos quedaran congelados y no se podran modificar.`,
      'Cerrar jornada'
    );
    if (confirmado) {
      this.asistenciaService.finalizarDia(this.fechaSeleccionada || undefined).subscribe({
        next: (res) => {
          this.notificacionService.exito(res.message || 'Cierre de jornada completado.');
          this.cargarAsistencias();
        },
        error: (err) => this.notificacionService.error(err.error?.message || 'Error procesando el cierre de día.')
      });
    }
  }

  //Observaciones de SUPERVISOR
  abrirObservacion(asis:Asistencia):void{
    /*
    Datos congelados a nivel de DIA completo (this.diaCerrado, ver cargarAsistencias), no del estado de ESTE
    registro puntual - un trabajador puede autocerrarse (SALIDA_OLVIDADA) mucho antes de que el Supervisor
    termine de confirmar O/X a los demas, y eso no debe congelar su observacion mientras el dia sigue abierto.
    */
    if(this.diaCerrado){
      this.notificacionService.advertencia('La jornada de este día ya fue cerrada y no se puede modificar.');
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
      error: (err) => this.notificacionService.error(err.error?.message || 'Error al guardar la observacion.')
    });
  }

  cerrarObservacion():void{
    this.observacionEditandoId = null;
    this.observacionTexto = '';
    this.cdr.detectChanges();
  }

  /*
  O/X: el Supervisor confirma si el trabajador que aparece logueado hoy realmente vino. A diferencia del botón de
  Observación (que sí se bloquea una vez cerrado el registro), esto funciona aunque la jornada ya esté
  FINALIZADO/SALIDA_OLVIDADA - el Supervisor está confirmando su observación directa de la realidad (vio o no vio
  a ese trabajador hoy), independiente de si el sistema ya cerró esa jornada. El Token de Hacienda puede circular
  entre trabajadores sin que el Supervisor lo note al momento de marcar, así que necesita poder decir "esto no fue
  real" incluso después de cerrado (ver backend). O (presente) es reversible y de bajo riesgo, se aplica directo.
  X (ausente) mueve el registro a OBSERVANDO y deja una nota automática (ver backend) - por eso pide confirmación
  antes.
  */
  async confirmarPresencia(asis: Asistencia, presente: boolean): Promise<void> {
    if (!presente) {
      const confirmado = await this.confirmacionService.preguntar(
        `¿Confirmas que ${asis.operador?.nombre_completo || 'este trabajador'} NO vino hoy? Esto lo marca como OBSERVANDO.`,
        'Marcar como NO presente'
      );
      if (!confirmado) return;
    }

    this.asistenciaService.confirmarAsistencia(asis.id, presente).subscribe({
      next: () => {
        this.notificacionService.exito('Confirmación registrada.');
        this.cargarAsistencias();
      },
      error: (err) => this.notificacionService.error(err.error?.message || 'Error al confirmar la asistencia.'),
    });
  }
}
