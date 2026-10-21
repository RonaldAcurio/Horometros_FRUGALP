import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RegistroActividadService } from '../../../../core/services/registro-actividad.service';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { Asistencia, Equipo, Actividad, RegistroActividad } from '../../../../core/models/asistencia.model';

/*
Botón ➕ a la izquierda de cada fila del Panel de Supervisor (pedido del usuario, 2026-10-20): abre el mismo
Panel de Actividades que ya usa el propio trabajador (mi-jornada.ts), para que el Supervisor pueda ver el
historial de labores de hoy de ESE trabajador (o la lista vacía si no tiene ninguna) y agregar una labor
nueva - siempre después de la última, misma validación que ya hace el backend (ver
horaEsAnteriorARegistrosPrevios en registro_actividad.controller.ts). A propósito es una versión MÁS SIMPLE
que mi-jornada.ts: no hay offline-first (esta pantalla la usa el Supervisor desde la oficina, no un trabajador
en el campo sin señal) y no hay flujo de QR/código - solo el Panel de Actividades en sí, apuntando a la
asistencia_id del trabajador elegido en vez de la del propio usuario logueado.
*/
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-panel-labores-modal',
  styleUrl: './panel-labores-modal.css',
  templateUrl: './panel-labores-modal.html',
})
export class PanelLaboresModal {
  visible = false;
  asistencia: Asistencia | null = null;
  esMecanico = true;

  registros: RegistroActividad[] = [];
  cargandoRegistros = false;

  private readonly MAX_RESULTADOS_AUTOCOMPLETAR = 30;
  private catalogoEquipos: Equipo[] = [];
  private catalogoActividades: Actividad[] = [];
  equipoBusqueda = '';
  mostrarOpcionesEquipo = false;
  actividadBusqueda = '';
  mostrarOpcionesActividad = false;

  nuevoRegistro = { equipo_id: null as number | null, actividad_id: null as number | null, area: '', horometro_inicio: null as number | null, observaciones: '' };
  horaInicioHH: number | null = null;
  horaInicioMM: number | null = null;
  guardandoRegistro = false;

  editandoRegistroId: number | null = null;

  registroFinalizandoId: number | null = null;
  horaFinHH: number | null = null;
  horaFinMM: number | null = null;
  horometroFinal: number | null = null;
  guardandoFinalizacion = false;

  constructor(
    private registroActividadService: RegistroActividadService,
    private asistenciaService: AsistenciaService,
    private notificacionService: NotificacionService,
    private confirmacionService: ConfirmacionService,
    private cdr: ChangeDetectorRef,
  ) {}

  abrir(asistencia: Asistencia): void {
    this.asistencia = asistencia;
    this.esMecanico = asistencia.operador?.rol !== 'OPERADOR';
    this.visible = true;
    this.limpiarFormularioNuevoRegistro();
    this.cargarCatalogos();
    this.cargarRegistros();
    this.cdr.detectChanges();
  }

  cerrar(): void {
    this.visible = false;
    this.asistencia = null;
    this.registros = [];
    this.editandoRegistroId = null;
    this.registroFinalizandoId = null;
    this.cdr.detectChanges();
  }

  private cargarCatalogos(): void {
    this.registroActividadService.obtenerTodosLosEquipos().subscribe({
      next: (equipos) => { this.catalogoEquipos = equipos; this.cdr.detectChanges(); },
      error: () => this.notificacionService.error('No se pudo cargar el catálogo de equipos.'),
    });
    this.asistenciaService.obtenerTodasLasActividades().subscribe({
      next: (actividades) => { this.catalogoActividades = actividades; this.cdr.detectChanges(); },
      error: () => this.notificacionService.error('No se pudo cargar el catálogo de actividades.'),
    });
  }

  private cargarRegistros(): void {
    if (!this.asistencia) return;
    this.cargandoRegistros = true;
    this.registroActividadService.obtenerPorAsistencia(this.asistencia.id).subscribe({
      next: (data) => {
        this.registros = data;
        this.cargandoRegistros = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoRegistros = false;
        this.notificacionService.error(err.error?.message || 'No se pudieron cargar las labores de hoy.');
        this.cdr.detectChanges();
      },
    });
  }

  // La última fila de 'registros' es siempre la última cronológicamente (ya viene ordenado por hora_inicio ASC
  // desde el backend, ver obtenerPorAsistencia) - mismo criterio que mi-jornada.ts (esUltimaActividad).
  esUltimaActividad(reg: RegistroActividad): boolean {
    return this.registros.length > 0 && this.registros[this.registros.length - 1].id === reg.id;
  }

  // Aviso (no bloqueo, pedido del usuario): si la última labor sigue abierta, se puede agregar otra igual - el
  // backend ya lo permite para cualquier llamador - pero conviene que el Supervisor lo sepa antes de hacerlo.
  get ultimaLaborSigueAbierta(): boolean {
    return this.registros.length > 0 && !this.registros[this.registros.length - 1].hora_fin;
  }

  get equiposFiltrados(): Equipo[] {
    const texto = this.equipoBusqueda.trim().toLowerCase();
    const filtrados = texto
      ? this.catalogoEquipos.filter((eq) => eq.codigo_megued.toLowerCase().includes(texto) || eq.nombre_equipo.toLowerCase().includes(texto))
      : this.catalogoEquipos;
    return filtrados.slice(0, this.MAX_RESULTADOS_AUTOCOMPLETAR);
  }

  get actividadesFiltradas(): Actividad[] {
    const texto = this.actividadBusqueda.trim().toLowerCase();
    const filtradas = texto
      ? this.catalogoActividades.filter((act) => act.codigo_megued.toLowerCase().includes(texto) || act.description.toLowerCase().includes(texto))
      : this.catalogoActividades;
    return filtradas.slice(0, this.MAX_RESULTADOS_AUTOCOMPLETAR);
  }

  abrirOpcionesEquipo(): void {
    this.mostrarOpcionesEquipo = true;
    this.cdr.detectChanges();
  }

  cerrarOpcionesEquipoConRetraso(): void {
    setTimeout(() => { this.mostrarOpcionesEquipo = false; this.cdr.detectChanges(); }, 200);
  }

  onBuscarEquipo(texto: string): void {
    this.equipoBusqueda = texto;
    this.nuevoRegistro.equipo_id = null;
    this.mostrarOpcionesEquipo = true;
    this.cdr.detectChanges();
  }

  seleccionarEquipo(eq: Equipo): void {
    this.nuevoRegistro.equipo_id = eq.id;
    this.equipoBusqueda = `${eq.codigo_megued} - ${eq.nombre_equipo}`;
    this.mostrarOpcionesEquipo = false;
    this.cdr.detectChanges();
  }

  abrirOpcionesActividad(): void {
    this.mostrarOpcionesActividad = true;
    this.cdr.detectChanges();
  }

  cerrarOpcionesActividadConRetraso(): void {
    setTimeout(() => { this.mostrarOpcionesActividad = false; this.cdr.detectChanges(); }, 200);
  }

  onBuscarActividad(texto: string): void {
    this.actividadBusqueda = texto;
    this.nuevoRegistro.actividad_id = null;
    this.mostrarOpcionesActividad = true;
    this.cdr.detectChanges();
  }

  seleccionarActividad(act: Actividad): void {
    this.nuevoRegistro.actividad_id = act.id;
    this.actividadBusqueda = `${act.codigo_megued} - ${act.description}`;
    this.mostrarOpcionesActividad = false;
    this.cdr.detectChanges();
  }

  private horaActualComponentes(): { hh: number; mm: number } {
    const fecha = new Date();
    return { hh: fecha.getHours(), mm: fecha.getMinutes() };
  }

  // Mismo criterio que mi-jornada.ts (horaComponentesAIso): combina HH/MM con la FECHA de la jornada en hora
  // local y lo manda como ISO. A diferencia de mi-jornada.ts (el trabajador siempre registra SU jornada de
  // hoy), acá la fecha base es la de la propia asistencia (asistencia.fecha) y no la de HOY - el Supervisor
  // puede seguir agregando/editando labores de un día anterior ya finalizado (pedido del usuario, 2026-10-21:
  // el ➕ ya no desaparece al finalizar), y usar "hoy" ahí movería la hora al día equivocado.
  private horaComponentesAIso(hh: number | null, mm: number | null): string | undefined {
    if (hh === null || hh === undefined || mm === null || mm === undefined || isNaN(hh) || isNaN(mm)) return undefined;
    const horas = Math.min(23, Math.max(0, Math.trunc(hh)));
    const minutos = Math.min(59, Math.max(0, Math.trunc(mm)));
    const fecha = this.fechaBaseAsistencia();
    fecha.setHours(horas, minutos, 0, 0);
    return fecha.toISOString();
  }

  private fechaBaseAsistencia(): Date {
    const fecha = this.asistencia?.fecha;
    if (fecha) {
      const [anio, mes, dia] = fecha.split('-').map(Number);
      if (anio && mes && dia) return new Date(anio, mes - 1, dia);
    }
    return new Date();
  }

  private limpiarFormularioNuevoRegistro(): void {
    this.nuevoRegistro = { equipo_id: null, actividad_id: null, area: '', horometro_inicio: null, observaciones: '' };
    const { hh, mm } = this.horaActualComponentes();
    this.horaInicioHH = hh;
    this.horaInicioMM = mm;
    this.equipoBusqueda = '';
    this.actividadBusqueda = '';
  }

  guardarNuevoRegistro(): void {
    if (this.editandoRegistroId !== null) {
      this.guardarEdicionRegistro();
      return;
    }
    if (!this.asistencia || !this.nuevoRegistro.equipo_id || !this.nuevoRegistro.actividad_id) return;
    if (this.horaInicioHH === null || this.horaInicioMM === null) return;

    const payload = {
      asistencia_id: this.asistencia.id,
      equipo_id: this.nuevoRegistro.equipo_id,
      actividad_id: this.nuevoRegistro.actividad_id,
      area: this.esMecanico ? this.nuevoRegistro.area : undefined,
      horometro_inicio: !this.esMecanico && this.nuevoRegistro.horometro_inicio !== null ? this.nuevoRegistro.horometro_inicio : undefined,
      observaciones: this.nuevoRegistro.observaciones || undefined,
      hora_inicio: this.horaComponentesAIso(this.horaInicioHH, this.horaInicioMM),
    };

    this.guardandoRegistro = true;
    this.registroActividadService.crear(payload).subscribe({
      next: () => {
        this.notificacionService.exito('Labor registrada.');
        this.limpiarFormularioNuevoRegistro();
        this.guardandoRegistro = false;
        this.cargarRegistros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardandoRegistro = false;
        this.notificacionService.error(err.error?.message || 'Error al registrar la labor.');
        this.cdr.detectChanges();
      },
    });
  }

  iniciarEdicionRegistro(reg: RegistroActividad): void {
    this.editandoRegistroId = reg.id;
    this.nuevoRegistro = {
      equipo_id: reg.equipo_id,
      actividad_id: reg.actividad_id,
      area: reg.area || '',
      horometro_inicio: reg.horometro_inicio ?? null,
      observaciones: reg.observaciones || '',
    };
    this.equipoBusqueda = reg.equipo ? `${reg.equipo.codigo_megued} - ${reg.equipo.nombre_equipo}` : '';
    this.actividadBusqueda = reg.actividad ? `${reg.actividad.codigo_megued} - ${reg.actividad.description}` : '';

    /*
    Hora de inicio/fin editables SOLO en este modal (Panel de Supervisor, pedido del usuario, 2026-10-21) - ver
    editarRegistroActividad/puedeForzarComoSupervisor. mi-jornada.ts nunca llama a este método con estos campos
    habilitados (ahí Hora Inicio sigue [disabled] y no existe un campo de Hora Fin en el editar).
    */
    const inicio = new Date(reg.hora_inicio);
    this.horaInicioHH = inicio.getHours();
    this.horaInicioMM = inicio.getMinutes();
    if (reg.hora_fin) {
      const fin = new Date(reg.hora_fin);
      this.horaFinHH = fin.getHours();
      this.horaFinMM = fin.getMinutes();
    } else {
      this.horaFinHH = null;
      this.horaFinMM = null;
    }
    this.cdr.detectChanges();
  }

  cancelarEdicionRegistro(): void {
    this.editandoRegistroId = null;
    this.limpiarFormularioNuevoRegistro();
    this.cdr.detectChanges();
  }

  private guardarEdicionRegistro(): void {
    const id = this.editandoRegistroId;
    if (id === null || !this.nuevoRegistro.equipo_id || !this.nuevoRegistro.actividad_id) return;
    if (this.horaInicioHH === null || this.horaInicioMM === null) return;

    const cambios = {
      equipo_id: this.nuevoRegistro.equipo_id,
      actividad_id: this.nuevoRegistro.actividad_id,
      area: this.esMecanico ? this.nuevoRegistro.area : undefined,
      horometro_inicio: !this.esMecanico && this.nuevoRegistro.horometro_inicio !== null ? this.nuevoRegistro.horometro_inicio : undefined,
      observaciones: this.nuevoRegistro.observaciones || undefined,
      // El backend solo aplica estas dos si quien edita es ADMIN/SUPERVISOR desde el Panel de Supervisor (ver
      // puedeForzarComoSupervisor) - si lo manda el propio trabajador, las ignora igual que siempre.
      hora_inicio: this.horaComponentesAIso(this.horaInicioHH, this.horaInicioMM),
      hora_fin: this.horaComponentesAIso(this.horaFinHH, this.horaFinMM),
    };

    this.guardandoRegistro = true;
    this.registroActividadService.editar(id, cambios).subscribe({
      next: () => {
        this.notificacionService.exito('Labor actualizada.');
        this.guardandoRegistro = false;
        this.editandoRegistroId = null;
        this.limpiarFormularioNuevoRegistro();
        this.cargarRegistros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardandoRegistro = false;
        this.notificacionService.error(err.error?.message || 'Error al editar la labor.');
        this.cdr.detectChanges();
      },
    });
  }

  /*
  forzar (pedido del usuario, 2026-10-21): salta el chequeo de "última labor" - sirve para limpiar labores
  duplicadas/mal registradas sin importar su posición en la jornada. Siempre visible en este modal (es
  exclusivo del Panel de Supervisor) pero el backend solo le hace caso si quien llama es ADMIN/SUPERVISOR
  (ver puedeForzarComoSupervisor) - no reemplaza al "Eliminar" normal, se agrega al lado.
  */
  async eliminarRegistro(reg: RegistroActividad, forzar = false): Promise<void> {
    const confirmado = await this.confirmacionService.preguntar(
      forzar
        ? '⚠️ Vas a eliminar esta labor sin importar su posición ni la hora en la jornada. Esta acción no se puede deshacer. ¿Seguro que quieres continuar?'
        : '¿Seguro que quieres eliminar esta labor? Esta acción no se puede deshacer.',
      forzar ? 'Forzar eliminar' : 'Eliminar labor'
    );
    if (!confirmado) return;

    this.registroActividadService.eliminar(reg.id, forzar).subscribe({
      next: () => {
        this.notificacionService.exito('Labor eliminada.');
        this.cargarRegistros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al eliminar la labor.');
        this.cdr.detectChanges();
      },
    });
  }

  abrirFinalizarRegistro(registro: RegistroActividad): void {
    this.registroFinalizandoId = registro.id;
    const { hh, mm } = this.horaActualComponentes();
    this.horaFinHH = hh;
    this.horaFinMM = mm;
    this.horometroFinal = null;
    this.cdr.detectChanges();
  }

  cancelarFinalizarRegistro(): void {
    this.registroFinalizandoId = null;
    this.cdr.detectChanges();
  }

  confirmarFinalizarRegistro(): void {
    if (!this.registroFinalizandoId || this.horaFinHH === null || this.horaFinMM === null) return;

    const id = this.registroFinalizandoId;
    const horaFin = this.horaComponentesAIso(this.horaFinHH, this.horaFinMM);
    const horometroFinal = !this.esMecanico && this.horometroFinal !== null ? this.horometroFinal : undefined;

    this.guardandoFinalizacion = true;
    this.registroActividadService.finalizar(id, undefined, horaFin, horometroFinal).subscribe({
      next: () => {
        this.notificacionService.exito('Labor finalizada.');
        this.registroFinalizandoId = null;
        this.guardandoFinalizacion = false;
        this.cargarRegistros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardandoFinalizacion = false;
        this.notificacionService.error(err.error?.message || 'Error al finalizar la labor.');
        this.cdr.detectChanges();
      },
    });
  }
}
