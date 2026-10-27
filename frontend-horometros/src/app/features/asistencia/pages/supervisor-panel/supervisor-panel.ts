import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import { forkJoin, map } from 'rxjs';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { HaciendaService } from '../../../../core/services/hacienda.service';
import { UsuarioService } from '../../../../core/services/usuario.service';
import { RegistroActividadService } from '../../../../core/services/registro-actividad.service';
import { ExportarExcelService } from '../../../../core/services/exportar-excel.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Asistencia, Operador } from '../../../../core/models/asistencia.model';
import { Hacienda } from '../../../../core/models/hacienda.model';
import { Usuario } from '../../../../core/models/usuario.model';
import { VisorFoto } from '../../components/visor-foto/visor-foto';
import { HojaActividadesModal, HojaGrupo, resolverHaciendaJornada } from '../../components/hoja-actividades-modal/hoja-actividades-modal';
import { PanelLaboresModal } from '../../components/panel-labores-modal/panel-labores-modal';
import { AgregarUsuarioModal } from '../../components/agregar-usuario-modal/agregar-usuario-modal';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { timeoutDeLista, mensajeErrorCarga } from '../../../../core/utils/peticion-lista.util';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, VisorFoto, HojaActividadesModal, PanelLaboresModal, AgregarUsuarioModal],
  selector: 'app-supervisor-panel',
  styleUrl: './supervisor-panel.css',
  templateUrl: './supervisor-panel.html',
})
export class SupervisorPanel implements OnInit {
  @ViewChild('hojaModal') hojaModal!: HojaActividadesModal;
  @ViewChild('panelLaboresModal') panelLaboresModal!: PanelLaboresModal;
  @ViewChild('agregarUsuarioModal') agregarUsuarioModal!: AgregarUsuarioModal;

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
  cargandoAsistencias: boolean = false;

  //Edicion de observacion
  observacionEditandoId: number | null=null;
  observacionTexto: string = '';

  // Token de Hacienda: cada Supervisor solo ve/genera el de SU PROPIA hacienda (perfil().hacienda_id),
  // independiente de las demas - no hay selector, no puede tocar el de otra hacienda (ver CLAUDE.md).
  miHacienda: Hacienda | null = null;

  /*
  PENDIENTE 1 (calendario de tokens, ver MEMORY.md): antes esta tarjeta mostraba SIEMPRE el token_actual de la
  hacienda tal cual (el de HOY, sin importar qué fecha estuviera viendo el Supervisor en el selector de arriba),
  y este getter "corregía" eso a mano comparando contra la fecha de generación del token. Ya no hace falta: con
  obtenerHaciendas(fecha) pidiendo la fecha vista (ver cargarMiHacienda), el backend devuelve directamente el
  token de ESE día - miHacienda.token_actual ya queda correcto para la fecha que se está mirando, no solo hoy.
  Se deja este getter como alias de solo lectura para no tocar la plantilla.
  */
  get tokenCorrespondeAFechaVista(): boolean {
    return !!this.miHacienda?.token_actual;
  }

  // Filtro por Supervisor: solo tiene sentido para ADMIN (ver esAdmin abajo) - un Supervisor real ya ve todo
  // mezclado en esta misma pantalla (deuda tecnica heredada, no filtra por hacienda propia, ver CLAUDE.md), asi
  // que dejarlo elegir OTRO supervisor no tendria sentido de negocio.
  supervisores: Usuario[] = [];
  supervisorIdFiltro: number | null = null;
  get esAdmin(): boolean {
    return this.authService.tieneRol('ADMIN');
  }

  // "Ver/Imprimir" por fila y "Imprimir General"/"Exportar a Excel" (pedido del usuario, 2026-10-02) - mismo
  // componente/servicio compartidos que ya usa el Panel de Asistente (ver hoja-actividades-modal.ts y
  // exportar-excel.service.ts). Acá SIEMPRE es un solo día (la fecha que ya está filtrada en esta pantalla),
  // nunca un rango.
  cargandoReporteImpresion = false;
  exportandoExcel = false;

  constructor(
    private asistenciaService: AsistenciaService,
    private haciendaService: HaciendaService,
    private usuarioService: UsuarioService,
    private registroActividadService: RegistroActividadService,
    private exportarExcelService: ExportarExcelService,
    protected authService: AuthService,
    private cdr: ChangeDetectorRef,
    private notificacionService: NotificacionService,
    private confirmacionService: ConfirmacionService,
    protected offlineSyncService: OfflineSyncService
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

    this.haciendaService.obtenerHaciendas(this.fechaSeleccionada || undefined).pipe(timeoutDeLista()).subscribe({
      next: (haciendas) => {
        this.miHacienda = haciendas.find((h) => h.id === haciendaId) || null;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando la hacienda del supervisor:', err);
        this.notificacionService.error(mensajeErrorCarga(err, 'Error al cargar tu hacienda.'));
        this.cdr.detectChanges();
      },
    });
  }

  generarMiToken(): void {
    if (!this.miHacienda) return;

    this.haciendaService.generarToken(this.miHacienda.id, this.fechaSeleccionada || undefined).subscribe({
      next: (res) => {
        /*
        PENDIENTE 1 (calendario de tokens): res.token_actual/token_expira_en son un campo heredado que SOLO
        representa el token de HOY (ver generarTokenHacienda en el backend) - si fechaSeleccionada es un dia
        futuro, esos 2 campos vienen null y pisarian mal la tarjeta. res.tokens_generados SI trae el dia que
        realmente se acaba de generar (esta llamada desde el Supervisor Panel siempre pide un solo dia a la
        vez, nunca manda 'dias', asi que siempre viene con exactamente 1 elemento).
        */
        const generado = res.tokens_generados?.[0];
        this.miHacienda!.token_actual = generado?.token ?? res.token_actual;
        this.miHacienda!.token_expira_en = generado?.expira_en ?? res.token_expira_en;
        this.notificacionService.exito(
          this.fechaSeleccionada
            ? `Token generado para el ${this.fechaSeleccionada}.`
            : 'Token generado. Vigente 24h.'
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al generar el token.');
        this.cdr.detectChanges();
      },
    });
  }

  // Copiar Token: @capacitor/clipboard en vez de navigator.clipboard directo - misma razon que
  // @capacitor/share/filesystem (ver CLAUDE.md) - las APIs web del navegador no siempre se comportan
  // igual dentro del WebView empaquetado, mejor usar el plugin nativo pensado para esto.
  async copiarToken(): Promise<void> {
    const token = this.miHacienda?.token_actual;
    if (!token) return;

    try {
      await Clipboard.write({ string: token });
      this.notificacionService.exito('Token copiado.');
    } catch (err) {
      console.error('Error al copiar el token:', err);
      this.notificacionService.error('No se pudo copiar el token.');
    }
  }

  async invalidarMiToken(): Promise<void> {
    if (!this.miHacienda) return;

    const confirmado = await this.confirmacionService.preguntar(
      this.fechaSeleccionada
        ? `¿Invalidar el token del ${this.fechaSeleccionada}? Los puntos de control que lo usen dejarán de poder marcar ese día hasta que generes uno nuevo.`
        : '¿Invalidar el token actual? Los puntos de control que lo usen dejarán de poder marcar hasta que generes uno nuevo.',
      'Invalidar token'
    );
    if (!confirmado) return;

    this.haciendaService.invalidarToken(this.miHacienda.id, this.fechaSeleccionada || undefined).subscribe({
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
    this.cargandoAsistencias = true;
    this.asistenciaService.obtenerAsistenciasHoy(this.fechaSeleccionada || undefined, this.paginaHoy, 30, this.supervisorIdFiltro || undefined).pipe(timeoutDeLista()).subscribe({
      next: (res) => {
        this.cargandoAsistencias = false;
        this.asistenciasHoy = res.data || [];
        this.totalPaginasHoy = res.totalPaginas || 1;
        this.totalHoy = res.total || 0;
        this.diaCerrado = res.diaCerrado;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoAsistencias = false;
        console.error('Error cargando asistencias:', err);
        this.notificacionService.error(mensajeErrorCarga(err, 'Error al cargar la asistencia del día.'));
        this.cdr.detectChanges();
      },
    });
    // Roster completo (pedido del usuario, 2026-10-27): aparte, siempre que se refresca la asistencia del
    // día, se refresca también la lista de quién de la hacienda TODAVÍA no tiene ninguna asistencia ese día -
    // ver cargarTrabajadoresSinMarcar.
    this.cargarTrabajadoresSinMarcar();
  }

  // --- Roster completo: trabajadores que aún no tienen ninguna Asistencia este día (pedido del usuario,
  // 2026-10-27) ---
  trabajadoresSinMarcar: Operador[] = [];
  cargandoRoster = false;

  /*
  El Panel de Hoy (tabla paginada de arriba) solo muestra a quien YA tiene Asistencia ese día - los
  trabajadores piden ver SIEMPRE la lista completa de la hacienda, para que ningún reporte deje a nadie
  afuera. Se arma aparte (no se mezcla con la tabla paginada de asistencias reales, que sigue intacta): el
  roster completo de la hacienda (obtenerOperadoresCompleto, sin paginar) menos quien ya tiene asistencia ese
  día (hasta 100, el mismo tope que ya usa el resto de la app para listados de un día - de sobra para la
  cuadrilla de una sola hacienda). Un trabajador de esta lista entra a la tabla de arriba en cuanto se le
  agrega una Asistencia real (ver onOperadorAgregado/abrirMarcarAusente) - deja de aparecer aquí solo.
  */
  private cargarTrabajadoresSinMarcar(): void {
    this.cargandoRoster = true;
    const supervisorId = this.supervisorIdFiltro || undefined;
    forkJoin({
      roster: this.asistenciaService.obtenerOperadoresCompleto(supervisorId),
      asistenciasDelDia: this.asistenciaService.obtenerAsistenciasHoy(this.fechaSeleccionada || undefined, 1, 100, supervisorId),
    }).subscribe({
      next: ({ roster, asistenciasDelDia }) => {
        const idsConAsistencia = new Set(asistenciasDelDia.data.map((a) => a.operador_id));
        this.trabajadoresSinMarcar = roster.filter((op) => !idsConAsistencia.has(op.id));
        this.cargandoRoster = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoRoster = false;
        this.cdr.detectChanges();
      },
    });
  }

  onCambioFecha():void{
    this.paginaHoy = 1;
    this.cargarAsistencias();
    // PENDIENTE 1 (calendario de tokens): la tarjeta de Token de Hacienda tambien pasa a reflejar la fecha
    // recien elegida (ver cargarMiHacienda), no solo la tabla de abajo.
    this.cargarMiHacienda();
  }

 cambiarPaginaHoy(nuevaPagina:number): void{
  if(nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasHoy){
    this.paginaHoy = nuevaPagina;
    this.cargarAsistencias();
  }
 }

  // Botón manual "Sincronizar ahora" (mismo patrón que mi-jornada.ts) - también se dispara solo al volver la
  // señal, esto es por si el Supervisor prefiere forzarlo antes.
  sincronizarAhora(): void {
    this.offlineSyncService.sincronizar();
  }

  // Cierre pendiente de sincronizar (ver cierrePendienteDeSincronizar/OfflineSyncService): el boton de la
  // plantilla se deshabilita con esto para que no se pueda encolar un segundo cierre del mismo dia/alcance
  // mientras el primero todavia no viajo al servidor.
  get cierrePendienteDeSincronizar(): boolean {
    return this.offlineSyncService.tieneFinalizarDiaPendiente(this.fechaSeleccionada || undefined, this.supervisorIdFiltro || undefined);
  }

  /*
  Offline-first (pedido del usuario, 2026-10-05): se captura la hora del CLIC antes de intentar la peticion y se
  manda siempre como hora_salida - si no hay señal, el cierre queda encolado (OfflineSyncService) con esa misma
  hora, y al sincronizar horas despues el backend la usa para los operadores que quedaron "olvidados" (ver
  finalizarDia), en vez de la hora en que la peticion recien pudo viajar.
  */
  async ejecutarCierreDiario(): Promise<void> {

    //Guarda defensiva: el boton ya se deshabilita en el HTML cuando el dia esta cerrado,
    //pero validamos aca tambien por si se llega a disparar el click de otra forma.
    if(this.diaCerrado){
      this.notificacionService.advertencia('Esta jornada ya fue cerrada anteriormente.');
      return;
    }
    if(this.cierrePendienteDeSincronizar){
      this.notificacionService.advertencia('El cierre de esta jornada ya quedó guardado y está pendiente de sincronizar.');
      return;
    }

    const etiquetaFEcha = this.fechaSeleccionada || 'la jornada de hoy';

    const confirmado = await this.confirmacionService.preguntar(
      `¿Desea realizar el cierre diario de ${etiquetaFEcha}? Los datos quedaran congelados y no se podran modificar.`,
      'Cerrar jornada'
    );
    if (!confirmado) return;

    const horaClick = new Date().toISOString();
    this.asistenciaService.finalizarDia(this.fechaSeleccionada || undefined, this.supervisorIdFiltro || undefined, horaClick).subscribe({
      next: (res) => {
        this.notificacionService.exito(res.message || 'Cierre de jornada completado.');
        this.cargarAsistencias();
      },
      error: (err) => {
        if (this.offlineSyncService.esFalloDeRed(err)) {
          this.offlineSyncService
            .encolarFinalizarDia(horaClick, this.fechaSeleccionada || undefined, this.supervisorIdFiltro || undefined)
            .then(() => {
              this.notificacionService.exito('Sin señal: el cierre quedó guardado con la hora de este momento y se enviará solo cuando vuelva la conexión.');
              this.cdr.detectChanges();
            });
          return;
        }
        this.notificacionService.error(err.error?.message || 'Error procesando el cierre de día.');
      },
    });
  }

  deshaciendoCierre = false;

  /*
  "Deshacer cierre": exclusivo ADMIN (el backend lo exige, ver deshacerCierreJornada ahí) - un Supervisor que
  cerró por error no puede deshacer su propio cierre, a propósito, para que quede una segunda persona de por
  medio. Solo tiene sentido con una hacienda puntual elegida (supervisorIdFiltro) y el día ya cerrado.
  */
  get puedeDeshacerCierre(): boolean {
    return this.esAdmin && this.supervisorIdFiltro !== null && this.diaCerrado;
  }

  async deshacerCierre(): Promise<void> {
    if (!this.puedeDeshacerCierre || this.deshaciendoCierre || this.supervisorIdFiltro === null) return;

    const confirmado = await this.confirmacionService.preguntar(
      '¿Deshacer el cierre de esta jornada? Los registros que ese cierre tocó vuelven a su estado anterior y se genera un Token nuevo. Esto no afecta nada que ya estuviera cerrado de antes.',
      'Deshacer cierre'
    );
    if (!confirmado) return;

    this.deshaciendoCierre = true;
    this.asistenciaService.deshacerCierreJornada(this.supervisorIdFiltro, this.fechaSeleccionada || undefined).subscribe({
      next: (res) => {
        this.deshaciendoCierre = false;
        this.notificacionService.exito(res.message || 'Cierre deshecho.');
        this.cargarAsistencias();
      },
      error: (err) => {
        this.deshaciendoCierre = false;
        this.notificacionService.error(err.error?.message || 'Error al deshacer el cierre.');
        this.cdr.detectChanges();
      },
    });
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
  O/X: el Supervisor confirma si el trabajador que aparece logueado hoy realmente vino. No se bloquea por el
  `estado` de ESE registro puntual (FINALIZADO/SALIDA_OLVIDADA) - el trabajador pudo marcar su propia salida
  mucho antes de que el Supervisor termine de revisar a todos, y eso no debe impedirle decir "esto no fue
  real" mientras el DIA sigue abierto (mismo criterio que la Observación). SÍ se bloquea una vez que "Cerrar
  Jornada" cerró el día completo (`diaCerrado`, ver el guard debajo y el backend) - decisión del usuario:
  "Cerrar Jornada" congela TODO sin excepción, ese reporte ya pasa al Panel de Asistente apenas se cierra.
  O (presente) es reversible y de bajo riesgo, se aplica directo. X (ausente) mueve el registro a OBSERVANDO y
  deja una nota automática (ver backend) - por eso pide confirmación antes.
  */
  async confirmarPresencia(asis: Asistencia, presente: boolean): Promise<void> {
    // Guarda defensiva: el botón ya se deshabilita en el HTML cuando el día está cerrado, pero validamos acá
    // también por si se llega a disparar el click de otra forma (mismo patrón que ejecutarCierreDiario).
    if (this.diaCerrado) {
      this.notificacionService.advertencia('Esta jornada ya fue cerrada y no se puede modificar.');
      return;
    }

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

  // ==================== "+ Agregar Usuario" / Panel de labores por fila ====================

  /*
  ADMIN necesita un Supervisor puntual elegido arriba para que el buscador tenga sentido (si no, el
  directorio completo trae ~950 trabajadores de TODAS las haciendas mezclados) - mismo criterio que
  puedeExportarGeneral, pero SIN su chequeo de "ya hay asistencias hoy": acá es al revés, el caso mas tipico
  es justo agregar al primer trabajador de un dia que todavia esta vacio. Un SUPERVISOR real no necesita
  elegir nada: el backend ya lo acota solo a sus propios trabajadores (ver obtenerOperadores).
  */
  get puedeAgregarUsuario(): boolean {
    return this.esAdmin ? this.supervisorIdFiltro !== null : true;
  }

  // Marca si el modal "Agregar Usuario" se abrió desde el flujo de "marcar ausente" del roster completo
  // (ver abrirMarcarAusente más abajo) - decide qué hacer en onOperadorAgregado() cuando se confirma.
  private marcandoAusenteDesdeRoster = false;

  abrirAgregarUsuario(): void {
    if (!this.puedeAgregarUsuario) return;
    this.marcandoAusenteDesdeRoster = false;
    this.agregarUsuarioModal.abrir({
      supervisorId: this.esAdmin ? this.supervisorIdFiltro : undefined,
      fecha: this.fechaSeleccionada || undefined,
    });
  }

  // Botón X de una fila del roster completo (alguien que nunca marcó ese día, pedido del usuario, 2026-10-27):
  // dispara el mismo modal "Agregar Usuario", ya con este operador fijo (sin buscarlo) y pidiendo la hora de
  // ingreso a mano - ver onOperadorAgregado, que al terminar abre el PanelLaboresModal automáticamente.
  abrirMarcarAusente(op: Operador): void {
    this.marcandoAusenteDesdeRoster = true;
    this.agregarUsuarioModal.abrir({
      supervisorId: this.esAdmin ? this.supervisorIdFiltro : undefined,
      fecha: this.fechaSeleccionada || undefined,
      operadorFijo: op,
    });
  }

  /*
  Se completó "Agregar Usuario" (pedido del usuario, 2026-10-27): si vino del flujo normal del botón "+",
  solo refresca la tabla, como siempre. Si vino de tocar X sobre alguien del roster completo que nunca marcó
  (abrirMarcarAusente), además abre de una vez el PanelLaboresModal sobre la Asistencia recién creada, para
  que el Supervisor le agregue las actividades - la X real (OBSERVANDO) se marca después, una vez agregadas,
  porque el backend ya no deja agregar labores a una Asistencia OBSERVANDO (ver puedeForzarEnEstaAsistencia).
  */
  onOperadorAgregado(asistencia: Asistencia): void {
    this.cargarAsistencias();
    if (this.marcandoAusenteDesdeRoster) {
      this.marcandoAusenteDesdeRoster = false;
      this.panelLaboresModal.abrir(asistencia);
    }
  }

  // Botón ➕ a la izquierda de cada fila (pedido del usuario, 2026-10-20): abre el Panel de Actividades de
  // ESE trabajador, igual que el que usa él mismo (ver PanelLaboresModal) - solo mientras la jornada sigue
  // EN_JORNADA (único estado donde el backend deja agregar labores, ver crearRegistroActividad).
  abrirPanelLabores(asis: Asistencia): void {
    this.panelLaboresModal.abrir(asis);
  }

  // ==================== "Ver/Imprimir" (columna Acción) ====================

  verHojaFila(asis: Asistencia): void {
    this.abrirHojaFila(asis, false);
  }

  imprimirHojaFila(asis: Asistencia): void {
    this.abrirHojaFila(asis, true);
  }

  private abrirHojaFila(asis: Asistencia, autoImprimir: boolean): void {
    if (!asis.operador) return;
    this.cargandoReporteImpresion = true;
    this.registroActividadService.obtenerPorOperador(asis.operador_id, asis.fecha, asis.fecha).subscribe({
      next: (registros) => {
        this.cargandoReporteImpresion = false;
        this.hojaModal.abrir([{
          operador: asis.operador!,
          registros,
          haciendaNombre: resolverHaciendaJornada(asis.operador!, asis),
          fecha: asis.fecha,
          observacionesSupervisor: asis.observaciones ?? null,
        }], { autoImprimir });
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al cargar las labores de ese día.');
        this.cdr.detectChanges();
      },
    });
  }

  /*
  ==================== "Imprimir General" / "Exportar a Excel" ====================
  A diferencia del Historial (Panel de Asistente), acá SIEMPRE hay una fecha puntual ya filtrada en pantalla
  (fechaSeleccionada, o "hoy" si está vacío - ver cargarAsistencias) y, para un SUPERVISOR real, su propia
  hacienda ya se conoce de entrada (miHacienda/su propio perfil) - no hace falta pedirle Hacienda+Supervisor
  como sí le pide el Historial a un ADMIN. El ADMIN sigue necesitando elegir un Supervisor puntual (si ve
  "Todos los Supervisores" mezclados no hay un único RESPONSABLE que poner en el encabezado, ni una sola
  hacienda a la que atribuirle el reporte - pedido explícito del usuario, 2026-10-02).
  */
  get puedeExportarGeneral(): boolean {
    if (this.asistenciasHoy.length === 0) return false;
    return this.esAdmin ? this.supervisorIdFiltro !== null : true;
  }

  // Junta a todos los operadores distintos que aparecen HOY en pantalla (la página actual, mismo criterio que
  // "Imprimir Hojas del rango" del Historial - ver asistencia-panel.ts) y abre su hoja en la misma ventana.
  // Al ser siempre UN solo día, cada operador es UN único grupo (no hace falta partir por fecha, ver
  // agruparPorDia del Historial).
  imprimirGeneral(): void {
    if (!this.puedeExportarGeneral) return;
    const fecha = this.fechaSeleccionada || this.asistenciasHoy[0]?.fecha;
    if (!fecha) return;

    // Un dia OBSERVANDO (la X del Supervisor, "no vino") YA aparece en el reporte, igual que cualquier otro
    // (pedido del usuario, 2026-10-27, reemplaza la exclusion que tenia esto desde el 2026-10-16) - mismo
    // criterio que exportarExcel mas abajo.
    const operadoresUnicos = new Map<number, Operador>();
    for (const asis of this.asistenciasHoy) {
      if (asis.operador && !operadoresUnicos.has(asis.operador_id)) {
        operadoresUnicos.set(asis.operador_id, asis.operador);
      }
    }
    if (operadoresUnicos.size === 0) {
      this.notificacionService.error('No hay operadores en la tabla para imprimir.');
      return;
    }

    this.cargandoReporteImpresion = true;
    const peticiones = Array.from(operadoresUnicos.values()).map((op) =>
      this.registroActividadService.obtenerPorOperador(op.id, fecha, fecha).pipe(
        map((registros): HojaGrupo => {
          const asis = this.asistenciasHoy.find((a) => a.operador_id === op.id);
          return {
            operador: op,
            registros,
            haciendaNombre: resolverHaciendaJornada(op, asis),
            fecha,
            observacionesSupervisor: asis?.observaciones ?? null,
          };
        })
      )
    );

    forkJoin(peticiones).subscribe({
      next: (grupos) => {
        this.cargandoReporteImpresion = false;
        this.hojaModal.abrir(grupos, { autoImprimir: true });
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al generar las hojas.');
        this.cdr.detectChanges();
      },
    });
  }

  exportarExcel(): void {
    if (!this.puedeExportarGeneral || this.exportandoExcel) return;
    const fecha = this.fechaSeleccionada || this.asistenciasHoy[0]?.fecha;
    if (!fecha) return;

    // La hacienda/el responsable del encabezado ya se conocen de entrada acá (al revés que en el Historial,
    // que necesita que el ADMIN elija Hacienda+Supervisor a mano): un Supervisor real usa su propia hacienda
    // (miHacienda) y su propio nombre (perfil()); el ADMIN usa el Supervisor que tenga filtrado arriba.
    let nombreHacienda: string | null;
    let nombreSupervisor: string;
    if (this.esAdmin) {
      const supervisor = this.supervisores.find((s) => s.id === this.supervisorIdFiltro);
      if (!supervisor) return;
      nombreHacienda = supervisor.hacienda?.nombre ?? null;
      nombreSupervisor = supervisor.nombre_completo;
    } else {
      nombreHacienda = this.miHacienda?.nombre ?? null;
      nombreSupervisor = this.authService.perfil()?.nombre_completo ?? '';
    }
    if (!nombreHacienda) {
      this.notificacionService.error('No se pudo determinar la hacienda para generar el Excel.');
      return;
    }

    // Mismo motivo que imprimirGeneral: un operador marcado OBSERVANDO (X) YA aparece en el Excel oficial,
    // marcado como ausente (pedido del usuario, 2026-10-27).
    const operadoresUnicos = new Map<number, Operador>();
    for (const asis of this.asistenciasHoy) {
      if (asis.operador && !operadoresUnicos.has(asis.operador_id)) {
        operadoresUnicos.set(asis.operador_id, asis.operador);
      }
    }
    if (operadoresUnicos.size === 0) {
      this.notificacionService.error('No hay trabajadores registrados ese día.');
      return;
    }

    this.exportandoExcel = true;
    this.cdr.detectChanges();
    const peticiones = Array.from(operadoresUnicos.values()).map((op) =>
      this.registroActividadService.obtenerPorOperador(op.id, fecha, fecha).pipe(
        map((registros) => ({ operador: op, registros }))
      )
    );
    forkJoin(peticiones).subscribe({
      next: (bloques) => {
        this.exportarExcelService.generarYDescargar(bloques, fecha, nombreHacienda!, nombreSupervisor)
          .catch((err) => {
            console.error('Error al generar el Excel:', err);
            this.notificacionService.error('No se pudo generar el archivo Excel. Intenta de nuevo.');
          })
          .finally(() => {
            this.exportandoExcel = false;
            this.cdr.detectChanges();
          });
      },
      error: (err) => {
        this.exportandoExcel = false;
        this.notificacionService.error(err.error?.message || 'Error al generar el Excel.');
        this.cdr.detectChanges();
      },
    });
  }
}
