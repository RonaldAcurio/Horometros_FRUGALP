import { Component, ChangeDetectorRef, OnInit, signal } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { Operador, Asistencia, RegistroActividad, Equipo, Actividad } from '../../../../core/models/asistencia.model';
import * as QRCode from 'qrcode';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { UsuarioService } from '../../../../core/services/usuario.service';
import { RegistroActividadService } from '../../../../core/services/registro-actividad.service';
import { HaciendaService } from '../../../../core/services/hacienda.service';
import { Usuario } from '../../../../core/models/usuario.model';
import { Hacienda } from '../../../../core/models/hacienda.model';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { VisorFoto } from '../../components/visor-foto/visor-foto';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';

@Component({
  standalone:true,
  imports: [CommonModule, FormsModule, VisorFoto],
  selector: 'app-asistencia-panel',
  styleUrl: './asistencia-panel.css',
  templateUrl: './asistencia-panel.html',
})
export class AsistenciaPanel implements OnInit{
  operadores: Operador[] = [];

  // Búsqueda y Paginación
  terminoBusqueda: string = '';
  paginaActual: number = 1;
  itemsPorPagina: number = 5;

  // Operador Seleccionado
  operadorSeleccionado: Operador | null = null;
  qrCodeUrl: string = '';

  // Formulario de edición rápida
  cedula: string = '';
  telefono: string = '';
  direccion: string = '';
  // A que Supervisor (y por lo tanto hacienda) pertenece de forma permanente este trabajador.
  supervisorIdSeleccionado: number | null = null;
  rolSeleccionado: 'MECANICO' | 'OPERADOR' = 'MECANICO';
  // Credenciales: solo se usan para ASIGNAR por primera vez (si el operador ya tiene usuario, se resetea
  // la clave aparte, ver abrirModalResetClaveOperador - usuario+clave van siempre juntos).
  credencialesOperador = { usuario: '', clave: '' };
  mostrarClaveCredenciales = signal(false);

  // Modal: Resetear clave de un Operador que YA tiene credenciales
  mostrarModalResetClaveOperador: boolean = false;
  claveResetOperador: string = '';
  mostrarClaveResetOperador = signal(false);

  // Lista de Supervisores (para el selector "a que hacienda pertenece")
  supervisores: Usuario[] = [];

  // Modal Nuevo Operador
  mostrarModalOperador: boolean = false;
  mostrarClaveNuevoOperador = signal(false);
  nuevoOperador: Partial<Operador> = {
    nombre_completo: '',
    codigo_megued: '',
    cedula: '',
    telefono: '',
    direccion: '',
    supervisor_id: null,
    usuario: '',
    rol: 'MECANICO',
  };
  nuevoOperadorClave: string = '';

  //Historial de ASISTENCIA
  tabActual: 'directorio' | 'historial' | 'equipos' | 'actividades' = 'directorio';
  historial: Asistencia[] = [];
  fechaInicioFiltro: string= '';
  fechaFinFiltro:string = '';
  // Filtro por hacienda: el Operador no tiene hacienda propia, se filtra via su Supervisor (ver backend).
  haciendas: Hacienda[] = [];
  haciendaIdFiltro: number | null = null;
  // Filtro por Supervisor (para que ADMIN vea solo lo que hizo un Supervisor puntual) - reusa 'supervisores',
  // ya cargado para el selector de "a que hacienda pertenece" al crear/editar un Operador.
  supervisorIdFiltro: number | null = null;
  //Paginacion del historial: el backend nunca manda todo el rando de fechas de una sola vez
  paginaHistorial: number = 1;
  totalPaginasHistorial: number = 1;
  totalHistorial: number = 0;

  // Reporte imprimible "Ver/Imprimir" (fila del Historial, o varios operadores a la vez desde el rango de
  // fechas del Historial): carga las labores para mostrarlas con el mismo diseño de la hoja física "REPORTES
  // DE LABORES DIARIOS". Se muestra en una ventana flotante (mismo patrón que "Ver Evidencia") en vez de una
  // pestaña nueva - la app va a quedar empaquetada, así que todo tiene que vivir dentro de la misma pantalla.
  cargandoReporteImpresion = false;
  mostrarModalHoja: boolean = false;
  // Un grupo por operador - normalmente 1 (fila del Historial), pero la impresión por rango de fechas manda
  // uno por cada operador distinto que aparece en la tabla filtrada, todos en la misma ventana con salto de
  // página entre uno y otro (ver imprimirHojasRangoHistorial).
  hojaGrupos: { operador: Operador; registros: RegistroActividad[] }[] = [];
  // Cuando la hoja es de UN solo día (fila del Historial) la fecha va junto al nombre del operador y se
  // ocultan la columna Fecha de la tabla y trae la observación del Supervisor de esa jornada. Cuando es un
  // rango de varios días (impresión por rango) queda null y la tabla vuelve a mostrar Fecha por fila.
  hojaFechaUnica: string | null = null;
  hojaObservacionesSupervisor: string | null = null;

  // Modal "Historial de Asistencia" de UN operador (Ficha, Directorio de Operadores): mismas columnas que la
  // pestaña Historial general, pero ya filtrado a este operador - reutiliza el mismo GET /historial con
  // operador_id (ver AsistenciaService.obtenerHistorial). Reemplaza al viejo botón "Ver/Imprimir Hoja de
  // Actividades" de la Ficha, que imprimía TODO el historial de labores de un operador sin acotar fecha.
  mostrarModalHistorialOperador: boolean = false;
  historialOperadorSel: Operador | null = null;
  historialOperadorRegistros: Asistencia[] = [];
  historialOperadorFechaInicio: string = '';
  historialOperadorFechaFin: string = '';
  paginaHistorialOperador: number = 1;
  totalPaginasHistorialOperador: number = 1;
  totalHistorialOperador: number = 0;
  cargandoHistorialOperador: boolean = false;

  // Pestaña "Equipo" (catálogo de maquinaria): mismo patrón de lista+búsqueda+paginación que ya usa el
  // autocompletar del Panel de Actividades, pero con +Agregar/Editar/Eliminar (soft-delete) via modal. La
  // búsqueda es en tiempo real (con debounce, ver onBuscarEquiposTab) - no hace falta apretar "Buscar".
  equipos: Equipo[] = [];
  equipoBusquedaTab: string = '';
  paginaEquiposTab: number = 1;
  totalPaginasEquiposTab: number = 1;
  totalEquiposTab: number = 0;
  mostrarModalEquipo: boolean = false;
  equipoEditando: Equipo | null = null;
  formEquipo = { codigo_megued: '', nombre_equipo: '' };
  private debounceEquiposTab?: ReturnType<typeof setTimeout>;

  // Pestaña "Actividad" (catálogo de labores): mismo patrón, búsqueda también en tiempo real.
  actividadesTab: Actividad[] = [];
  actividadBusquedaTab: string = '';
  paginaActividadesTab: number = 1;
  totalPaginasActividadesTab: number = 1;
  totalActividadesTab: number = 0;
  mostrarModalActividad: boolean = false;
  private debounceActividadesTab?: ReturnType<typeof setTimeout>;
  actividadEditando: Actividad | null = null;
  formActividad: { codigo_megued: string; description: string; categoria: 'TALLER' | 'CAMPO' } = { codigo_megued: '', description: '', categoria: 'TALLER' };

  constructor(
    private asistenciaService: AsistenciaService,
    private usuarioService: UsuarioService,
    private registroActividadService: RegistroActividadService,
    private haciendaService: HaciendaService,
    private cdr: ChangeDetectorRef,
    private notificacionService: NotificacionService,
    private confirmacionService: ConfirmacionService
  ){};

  ngOnInit(): void {
    this.cargarOperadores();
    this.cargarSupervisores();
    this.cargarHaciendas();
  }

  cargarHaciendas(): void {
    this.haciendaService.obtenerHaciendas().subscribe({
      next: (data) => { this.haciendas = data; this.cdr.detectChanges(); },
      error: (err) => console.error('Error cargando haciendas:', err),
    });
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

  cargarOperadores(): void {
    this.asistenciaService.obtenerOperadores().subscribe({
      next: (data: any) => {
        this.operadores = Array.isArray(data) ? data : data?.data || [];
        this.paginaActual = 1;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando operadores:', err)
    });
  }

  // FILTRADO Y PAGINACIÓN
  get operadoresFiltrados(): Operador[] {
    if (!this.operadores || !Array.isArray(this.operadores)) return [];
    const termino = (this.terminoBusqueda || '').toLowerCase().trim();
    if (!termino) return this.operadores;

    return this.operadores.filter(op => {
      const nombre = (op.nombre_completo || '').toString().toLowerCase();
      const codigo = (op.codigo_megued || op.id || '').toString().toLowerCase();
      const cedula = (op.cedula || '').toString().toLowerCase();
      return nombre.includes(termino) || codigo.includes(termino) || cedula.includes(termino);
    });
  }

  get operadoresPaginados(): Operador[] {
    const filtrados = this.operadoresFiltrados;
    if (filtrados.length === 0) return [];

    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return filtrados.slice(inicio, inicio + this.itemsPorPagina);
  }

  get totalPaginas(): number {
    return Math.ceil(this.operadoresFiltrados.length / this.itemsPorPagina) || 1;
  }

  onSearchChange(): void {
    this.paginaActual = 1;
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
      this.paginaActual = nuevaPagina;
    }
  }

  // SELECCIÓN Y EDICIÓN
  async seleccionarOperador(op: Operador): Promise<void> {
    this.operadorSeleccionado = op;
    this.cedula = op.cedula || '';
    this.telefono = op.telefono || '';
    this.direccion = op.direccion || '';
    this.supervisorIdSeleccionado = op.supervisor_id ?? null;
    this.rolSeleccionado = op.rol || 'MECANICO';
    this.credencialesOperador = { usuario: '', clave: '' };
    this.mostrarClaveCredenciales.set(false);
    await this.generarQR(op.id);
    this.cdr.detectChanges();
  }

  async generarQR(operadorId: number): Promise<void> {
    try {
      const payload = JSON.stringify({ operador_id: operadorId });
      this.qrCodeUrl = await QRCode.toDataURL(payload, { width: 220, margin: 2 });
    } catch (err) {
      console.error('Error generando QR:', err);
    }
  }

  guardarDatosOperador(): void {
    if (!this.operadorSeleccionado) return;

    const datos: any = {
      cedula: this.cedula,
      telefono: this.telefono,
      direccion: this.direccion,
      supervisor_id: this.supervisorIdSeleccionado,
      rol: this.rolSeleccionado,
    };

    // Las credenciales solo se mandan si se estan asignando por primera vez (usuario+clave van juntos,
    // ver validarCredencialesOperador en el backend). Si el operador ya tiene usuario, esto queda vacio
    // y el reseteo de clave se hace aparte (ver abrirModalResetClaveOperador).
    if (this.credencialesOperador.usuario && this.credencialesOperador.clave) {
      datos.usuario = this.credencialesOperador.usuario;
      datos.clave = this.credencialesOperador.clave;
    }

    this.asistenciaService.actualizarOperador(this.operadorSeleccionado.id, datos).subscribe({
      next: (res) => {
        this.notificacionService.exito('¡Datos del operador actualizados exitosamente!');
        this.operadorSeleccionado = res.operador;
        this.credencialesOperador = { usuario: '', clave: '' };
        this.cargarOperadores();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al actualizar los datos');
        this.cdr.detectChanges();
      }
    });
  }

  // --- Resetear clave de un Operador que YA tiene credenciales ---
  abrirModalResetClaveOperador(): void {
    this.claveResetOperador = '';
    this.mostrarClaveResetOperador.set(false);
    this.mostrarModalResetClaveOperador = true;
  }

  cerrarModalResetClaveOperador(): void {
    this.mostrarModalResetClaveOperador = false;
  }

  guardarClaveResetOperador(): void {
    if (!this.operadorSeleccionado || this.claveResetOperador.length < 6) return;

    this.asistenciaService.resetearClaveOperador(this.operadorSeleccionado.id, this.claveResetOperador).subscribe({
      next: () => {
        this.notificacionService.exito('Clave del operador actualizada correctamente.');
        this.cerrarModalResetClaveOperador();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al resetear la clave.');
        this.cdr.detectChanges();
      },
    });
  }

  // MODAL NUEVO OPERADOR
  private operadorNuevoVacio(): Partial<Operador> {
    return { nombre_completo: '', codigo_megued: '', cedula: '', telefono: '', direccion: '', supervisor_id: null, usuario: '', rol: 'MECANICO' };
  }

  abrirModalNuevoOperador(): void {
    this.nuevoOperador = this.operadorNuevoVacio();
    this.nuevoOperadorClave = '';
    this.mostrarClaveNuevoOperador.set(false);
    this.mostrarModalOperador = true;
  }

  cerrarModalNuevoOperador(): void {
    this.mostrarModalOperador = false;
    this.nuevoOperador = this.operadorNuevoVacio();
    this.nuevoOperadorClave = '';
  }

  guardarNuevoOperador(): void {
    if (!this.nuevoOperador.nombre_completo || !this.nuevoOperador.codigo_megued) return;

    // usuario+clave van siempre juntos (ver backend) - si solo se lleno uno, no se manda ninguno.
    const datos: Partial<Operador> & { clave?: string } = { ...this.nuevoOperador };
    if (datos.usuario && this.nuevoOperadorClave) {
      datos.clave = this.nuevoOperadorClave;
    } else {
      delete datos.usuario;
    }
    if (!datos.supervisor_id) delete datos.supervisor_id;

    this.asistenciaService.crearOperador(datos).subscribe({
      next: () => {
        this.notificacionService.exito('¡Operador creado con éxito!');
        this.cargarOperadores();
        this.cerrarModalNuevoOperador();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al crear operador:', err);
        this.notificacionService.error(err.error?.message || 'Error al guardar operador.');
        this.cdr.detectChanges();
      }
    });
  }

  // Eliminar (soft-delete) el Operador seleccionado en la Ficha - desaparece del Directorio, pero sus
  // Asistencias/RegistroActividad ya creados lo siguen mostrando con normalidad (ver backend).
  async eliminarOperadorSeleccionado(): Promise<void> {
    if (!this.operadorSeleccionado) return;

    const confirmado = await this.confirmacionService.preguntar(
      `¿Eliminar a ${this.operadorSeleccionado.nombre_completo}? Ya no va a aparecer en el Directorio, pero su historial de asistencia y labores se conserva.`,
      'Eliminar operador'
    );
    if (!confirmado) return;

    this.asistenciaService.eliminarOperador(this.operadorSeleccionado.id).subscribe({
      next: () => {
        this.notificacionService.exito('Operador eliminado correctamente.');
        this.operadorSeleccionado = null;
        this.cargarOperadores();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al eliminar el operador.');
        this.cdr.detectChanges();
      },
    });
  }

  imprimirQR(): void {
    const ventanaImpresion = window.open('', '_blank');
    if (ventanaImpresion && this.operadorSeleccionado) {
      ventanaImpresion.document.write(`
        <html>
          <head><title>Carnet QR - ${this.operadorSeleccionado.nombre_completo}</title></head>
          <body style="text-align:center; font-family:sans-serif; padding:20px;">
            <h2>${this.operadorSeleccionado.nombre_completo}</h2>
            <p>Cédula: ${this.cedula || 'N/A'}</p>
            <img src="${this.qrCodeUrl}" width="200" />
            <p><strong>Carnet de Control de Asistencia</strong></p>
            <script>window.print(); window.close();</script>
          </body>
        </html>
      `);
      ventanaImpresion.document.close();
    }
  }

  /*
  Ver/Imprimir hoja de actividades: mismo diseño de la hoja física "REPORTES DE LABORES DIARIOS" que el usuario
  compartió, como ventana FLOTANTE dentro de la misma pantalla (mismo patrón que "Ver Evidencia", visor-foto.ts)
  en vez de una pestaña nueva - la app va empaquetada, así que abrir un link/ventana del navegador aparte no
  tiene sentido ahí. Imprimir usa la propia ventana (window.print()) con el resto de la pantalla oculto vía CSS
  de impresión (ver .imprimible en styles.css), no un documento aparte.

  Dos puntos de entrada, ambos desde el Historial de Asistencia (ya no existe uno en la Ficha del Directorio -
  ese imprimía TODO el historial de labores de un operador sin acotar fecha, se reemplazó por acotar siempre a
  un rango):
  - `verHojaFilaHistorial`/`imprimirHojaFilaHistorial`: UN SOLO día puntual (la fila clicada) - "Ver" abre la
    vista previa sin imprimir, "Imprimir" además dispara la impresión. Al ser un solo día la fecha se muestra
    junto al nombre del operador (no repetida por fila) y se agrega el pie con la observación que el Supervisor
    haya dejado sobre esa jornada.
  - `imprimirHojasRangoHistorial`: TODOS los operadores distintos que aparecen en la tabla del Historial ya
    filtrada por un rango Desde/Hasta - une la hoja de cada uno en la misma ventana, siempre con Fecha por fila
    (puede haber varios días por persona). El contenido fluye normal al imprimir (caben varios operadores
    cortos por hoja para no desperdiciar papel), pero cada operador nunca se parte a la mitad entre una hoja y
    la siguiente (ver break-inside:avoid en el @media print de asistencia-panel.css).
  */
  verHojaFilaHistorial(reg: Asistencia): void {
    this.abrirHojaFilaHistorial(reg, false);
  }

  imprimirHojaFilaHistorial(reg: Asistencia): void {
    this.abrirHojaFilaHistorial(reg, true);
  }

  private abrirHojaFilaHistorial(reg: Asistencia, autoImprimir: boolean): void {
    if (!reg.operador) return;
    this.cargandoReporteImpresion = true;
    this.registroActividadService.obtenerPorOperador(reg.operador_id, reg.fecha, reg.fecha).subscribe({
      next: (registros) => {
        this.cargandoReporteImpresion = false;
        this.abrirHojaActividades([{ operador: reg.operador!, registros }], {
          fechaUnica: reg.fecha,
          observacionesSupervisor: reg.observaciones ?? null,
          autoImprimir,
        });
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al cargar las labores de ese día.');
        this.cdr.detectChanges();
      },
    });
  }

  // Junta a todos los operadores distintos de la tabla del Historial YA FILTRADA (la página actual, no todo el
  // rango completo si hay más páginas) y les arma la hoja de cada uno, acotada al mismo rango Desde/Hasta
  // activo. Solo se habilita cuando el filtro de fecha está completo (ver [disabled] en el template).
  imprimirHojasRangoHistorial(): void {
    if (!this.fechaInicioFiltro || !this.fechaFinFiltro) return;

    const operadoresUnicos = new Map<number, Operador>();
    for (const reg of this.historial) {
      if (reg.operador && !operadoresUnicos.has(reg.operador_id)) {
        operadoresUnicos.set(reg.operador_id, reg.operador);
      }
    }
    if (operadoresUnicos.size === 0) {
      this.notificacionService.error('No hay operadores en la tabla para imprimir.');
      return;
    }

    this.cargandoReporteImpresion = true;
    const peticiones = Array.from(operadoresUnicos.values()).map((op) =>
      this.registroActividadService.obtenerPorOperador(op.id, this.fechaInicioFiltro, this.fechaFinFiltro).pipe(
        map((registros) => ({ operador: op, registros }))
      )
    );

    forkJoin(peticiones).subscribe({
      next: (grupos) => {
        this.cargandoReporteImpresion = false;
        this.abrirHojaActividades(grupos, { autoImprimir: true });
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al generar las hojas del rango.');
        this.cdr.detectChanges();
      },
    });
  }

  duracionLabor(reg: RegistroActividad): string {
    if (!reg.hora_fin) return '—';
    const minutos = Math.round((new Date(reg.hora_fin).getTime() - new Date(reg.hora_inicio).getTime()) / 60000);
    if (minutos < 0) return '—';
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return horas > 0 ? `${horas}h ${resto}min` : `${resto}min`;
  }

  private abrirHojaActividades(
    grupos: { operador: Operador; registros: RegistroActividad[] }[],
    opciones: { fechaUnica?: string; observacionesSupervisor?: string | null; autoImprimir: boolean }
  ): void {
    this.hojaGrupos = grupos;
    this.hojaFechaUnica = opciones.fechaUnica ?? null;
    this.hojaObservacionesSupervisor = opciones.observacionesSupervisor ?? null;
    this.mostrarModalHoja = true;
    this.cdr.detectChanges();

    // El print tiene que dispararse despues de que el modal ya este pintado en el DOM.
    if (opciones.autoImprimir) {
      setTimeout(() => this.imprimirHoja(), 150);
    }
  }

  imprimirHoja(): void {
    window.print();
  }

  cerrarModalHoja(): void {
    this.mostrarModalHoja = false;
    this.hojaGrupos = [];
    this.hojaFechaUnica = null;
    this.hojaObservacionesSupervisor = null;
    this.cdr.detectChanges();
  }

  // ==================== MODAL "HISTORIAL DE ASISTENCIA" DE UN OPERADOR (Ficha) ====================

  abrirModalHistorialOperador(op: Operador): void {
    this.historialOperadorSel = op;
    this.historialOperadorFechaInicio = '';
    this.historialOperadorFechaFin = '';
    this.mostrarModalHistorialOperador = true;
    this.buscarHistorialOperador();
  }

  cerrarModalHistorialOperador(): void {
    this.mostrarModalHistorialOperador = false;
    this.historialOperadorSel = null;
    this.historialOperadorRegistros = [];
    this.cdr.detectChanges();
  }

  buscarHistorialOperador(): void {
    this.paginaHistorialOperador = 1;
    this.cargarPaginaHistorialOperador();
  }

  cambiarPaginaHistorialOperador(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasHistorialOperador) {
      this.paginaHistorialOperador = nuevaPagina;
      this.cargarPaginaHistorialOperador();
    }
  }

  private cargarPaginaHistorialOperador(): void {
    if (!this.historialOperadorSel) return;
    this.cargandoHistorialOperador = true;
    this.asistenciaService.obtenerHistorial(
      this.historialOperadorFechaInicio || undefined,
      this.historialOperadorFechaFin || undefined,
      this.paginaHistorialOperador,
      10,
      undefined,
      this.historialOperadorSel.id
    ).subscribe({
      next: (res) => {
        this.cargandoHistorialOperador = false;
        this.historialOperadorRegistros = res.data || [];
        this.totalPaginasHistorialOperador = res.totalPaginas || 1;
        this.totalHistorialOperador = res.total || 0;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoHistorialOperador = false;
        this.notificacionService.error('Error al cargar el historial de este operador.');
        this.cdr.detectChanges();
      },
    });
  }

  cambiarTab(tab:'directorio' | 'historial' | 'equipos' | 'actividades'):void{
    this.tabActual = tab;

    if(tab === 'historial' && this.historial.length === 0){
      this.buscarHistorial();
    }
    if(tab === 'equipos' && this.equipos.length === 0){
      this.buscarEquiposTab();
    }
    if(tab === 'actividades' && this.actividadesTab.length === 0){
      this.buscarActividadesTab();
    }
  }

  //Al cambiar el filtro de fechas siempre volvemos a la pagina 1 (una busqueda nueva)
  buscarHistorial():void{
    this.paginaHistorial = 1;
    this.cargarPaginaHistorial();
  }

  cambiarPaginaHistorial(nuevaPagina:number):void{
    if(nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasHistorial){
      this.paginaHistorial = nuevaPagina;
      this.cargarPaginaHistorial();
    }
  }

  private cargarPaginaHistorial():void{
    this.asistenciaService.obtenerHistorial(
      this.fechaInicioFiltro || undefined,
      this.fechaFinFiltro || undefined,
      this.paginaHistorial,
      30,
      this.haciendaIdFiltro || undefined,
      undefined,
      this.supervisorIdFiltro || undefined
    ).subscribe({
      next:(res) => {
        this.historial = res.data || [];
        this.totalPaginasHistorial = res.totalPaginas || 1;
        this.totalHistorial = res.total || 0;
        this.cdr.detectChanges();
      },
      error:(err) => console.error('Error cargando historial:', err)
    });
  }

  // ==================== PESTAÑA "EQUIPO" ====================

  // Búsqueda en tiempo real: cada tecla reinicia el debounce (300ms, mismo valor que el autocompletar de
  // Equipo/Actividad del Panel de Actividades, ver mi-jornada.ts) en vez de esperar a que aprieten "Buscar".
  onBuscarEquiposTab(): void {
    if (this.debounceEquiposTab) clearTimeout(this.debounceEquiposTab);
    this.debounceEquiposTab = setTimeout(() => this.buscarEquiposTab(), 300);
  }

  buscarEquiposTab(): void {
    this.paginaEquiposTab = 1;
    this.cargarPaginaEquiposTab();
  }

  cambiarPaginaEquiposTab(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasEquiposTab) {
      this.paginaEquiposTab = nuevaPagina;
      this.cargarPaginaEquiposTab();
    }
  }

  private cargarPaginaEquiposTab(): void {
    this.registroActividadService.obtenerEquipos(this.paginaEquiposTab, 20, this.equipoBusquedaTab || undefined).subscribe({
      next: (res) => {
        this.equipos = res.data || [];
        this.totalPaginasEquiposTab = res.totalPaginas || 1;
        this.totalEquiposTab = res.total || 0;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando equipos:', err),
    });
  }

  abrirModalNuevoEquipo(): void {
    this.equipoEditando = null;
    this.formEquipo = { codigo_megued: '', nombre_equipo: '' };
    this.mostrarModalEquipo = true;
  }

  abrirModalEditarEquipo(eq: Equipo): void {
    this.equipoEditando = eq;
    this.formEquipo = { codigo_megued: eq.codigo_megued, nombre_equipo: eq.nombre_equipo };
    this.mostrarModalEquipo = true;
  }

  cerrarModalEquipo(): void {
    this.mostrarModalEquipo = false;
    this.equipoEditando = null;
  }

  guardarEquipo(): void {
    if (!this.formEquipo.codigo_megued || !this.formEquipo.nombre_equipo) return;

    const peticion: Observable<unknown> = this.equipoEditando
      ? this.registroActividadService.actualizarEquipo(this.equipoEditando.id, this.formEquipo)
      : this.registroActividadService.crearEquipo(this.formEquipo);

    peticion.subscribe({
      next: () => {
        this.notificacionService.exito(this.equipoEditando ? 'Equipo actualizado con éxito.' : '¡Equipo creado con éxito!');
        this.cerrarModalEquipo();
        this.cargarPaginaEquiposTab();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.notificacionService.error(err.error?.message || 'Error al guardar el equipo.');
        this.cdr.detectChanges();
      },
    });
  }

  async eliminarEquipoTab(eq: Equipo): Promise<void> {
    const confirmado = await this.confirmacionService.preguntar(
      `¿Eliminar el equipo ${eq.nombre_equipo}? Ya no va a aparecer en los selectores, pero las labores ya registradas con él se conservan.`,
      'Eliminar equipo'
    );
    if (!confirmado) return;

    this.registroActividadService.eliminarEquipo(eq.id).subscribe({
      next: () => {
        this.notificacionService.exito('Equipo eliminado correctamente.');
        this.cargarPaginaEquiposTab();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al eliminar el equipo.');
        this.cdr.detectChanges();
      },
    });
  }

  // ==================== PESTAÑA "ACTIVIDAD" ====================

  onBuscarActividadesTab(): void {
    if (this.debounceActividadesTab) clearTimeout(this.debounceActividadesTab);
    this.debounceActividadesTab = setTimeout(() => this.buscarActividadesTab(), 300);
  }

  buscarActividadesTab(): void {
    this.paginaActividadesTab = 1;
    this.cargarPaginaActividadesTab();
  }

  cambiarPaginaActividadesTab(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasActividadesTab) {
      this.paginaActividadesTab = nuevaPagina;
      this.cargarPaginaActividadesTab();
    }
  }

  private cargarPaginaActividadesTab(): void {
    this.asistenciaService.obtenerActividadesPaginado(this.paginaActividadesTab, 20, this.actividadBusquedaTab || undefined).subscribe({
      next: (res) => {
        this.actividadesTab = res.data || [];
        this.totalPaginasActividadesTab = res.totalPaginas || 1;
        this.totalActividadesTab = res.total || 0;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando actividades:', err),
    });
  }

  abrirModalNuevaActividad(): void {
    this.actividadEditando = null;
    this.formActividad = { codigo_megued: '', description: '', categoria: 'TALLER' };
    this.mostrarModalActividad = true;
  }

  abrirModalEditarActividad(act: Actividad): void {
    this.actividadEditando = act;
    this.formActividad = { codigo_megued: act.codigo_megued, description: act.description, categoria: act.categoria || 'TALLER' };
    this.mostrarModalActividad = true;
  }

  cerrarModalActividad(): void {
    this.mostrarModalActividad = false;
    this.actividadEditando = null;
  }

  guardarActividad(): void {
    if (!this.formActividad.codigo_megued || !this.formActividad.description) return;

    const peticion: Observable<unknown> = this.actividadEditando
      ? this.asistenciaService.actualizarActividad(this.actividadEditando.id, this.formActividad)
      : this.asistenciaService.crearActividad(this.formActividad);

    peticion.subscribe({
      next: () => {
        this.notificacionService.exito(this.actividadEditando ? 'Actividad actualizada con éxito.' : '¡Actividad creada con éxito!');
        this.cerrarModalActividad();
        this.cargarPaginaActividadesTab();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.notificacionService.error(err.error?.message || 'Error al guardar la actividad.');
        this.cdr.detectChanges();
      },
    });
  }

  async eliminarActividadTab(act: Actividad): Promise<void> {
    const confirmado = await this.confirmacionService.preguntar(
      `¿Eliminar la actividad ${act.description}? Ya no va a aparecer en los selectores, pero las marcaciones/labores ya registradas con ella se conservan.`,
      'Eliminar actividad'
    );
    if (!confirmado) return;

    this.asistenciaService.eliminarActividad(act.id).subscribe({
      next: () => {
        this.notificacionService.exito('Actividad eliminada correctamente.');
        this.cargarPaginaActividadesTab();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al eliminar la actividad.');
        this.cdr.detectChanges();
      },
    });
  }
}
