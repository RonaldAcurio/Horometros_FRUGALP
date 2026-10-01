import { Component, ChangeDetectorRef, OnInit, signal } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { Operador, Asistencia, RegistroActividad, Equipo, Actividad } from '../../../../core/models/asistencia.model';
import * as QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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
import { leerFilasExcel, descargarPlantillaExcel } from '../../../../core/utils/excel-importar.util';
// '@e965/xlsx' (usado arriba para la plantilla de importar) no soporta combinar celdas, colores ni fuentes en
// su version gratuita - el "Exportar a Excel" del Historial (pedido del usuario, 2026-10-01) SI necesita todo
// eso para calcar el diseno de REGISTRO DE LABORES DIARIAS que ya usan en papel, asi que usa ExcelJS aparte.
import { Workbook, FillPattern, CellValue } from 'exceljs';

// Respuesta de los endpoints /equipos/importar y /actividad/importar (ver equipo.controller.ts/actividades.controller.ts).
interface ResultadoImportacion {
  creados: number;
  rechazados: { fila: number; motivo: string }[];
}

@Component({
  standalone:true,
  imports: [CommonModule, FormsModule, VisorFoto],
  selector: 'app-asistencia-panel',
  styleUrl: './asistencia-panel.css',
  templateUrl: './asistencia-panel.html',
})
export class AsistenciaPanel implements OnInit{
  operadores: Operador[] = [];

  // Búsqueda y Paginación (por servidor, ver cargarOperadores - antes filtraba/paginaba en el navegador sobre
  // el arreglo completo, lo que salió lento en la prueba de carga apenas el volumen se acerca a los ~950
  // operadores reales, ver CLAUDE.md "Pruebas de carga").
  terminoBusqueda: string = '';
  paginaActual: number = 1;
  totalPaginas: number = 1;
  totalOperadores: number = 0;
  private debounceOperadores?: ReturnType<typeof setTimeout>;

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
  tabActual: 'directorio' | 'historial' | 'equipos' | 'actividades' | 'terminos' = 'directorio';
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
  // "Exportar a Excel" (Historial, pedido del usuario 2026-10-01): a diferencia de "Imprimir Hojas del rango",
  // este reporte es SIEMPRE de un solo dia (asi lo manejan en papel) y necesita Hacienda+Supervisor puntuales
  // - sin eso no habria un unico "RESPONSABLE" que poner en el encabezado, y se mezclarian trabajadores de
  // haciendas distintas en la misma hoja (ver puedeExportarExcel).
  exportandoExcel = false;
  /*
  Un grupo = UN operador en UN día puntual - siempre, incluso en la impresión por rango (ver
  imprimirHojasRangoHistorial): antes un grupo del rango mezclaba varios días del mismo operador en una sola
  tabla con columna "Fecha" por fila, y el pie "Observaciones del Supervisor" (que es un dato POR DÍA, vive en
  Asistencia.observaciones) directamente no se mostraba ahí porque no había un único día al que atribuírselo
  (bug reportado por el usuario, 2026-10-01). Partiendo cada operador en un grupo por día, la fecha vuelve a ir
  junto al nombre (como ya hacía la hoja de un solo día) y cada grupo trae SU PROPIA observación - ya no hace
  falta distinguir "modo un día" vs "modo rango" en ningún otro lado del componente ni del template.
  */
  hojaGrupos: { operador: Operador; registros: RegistroActividad[]; haciendaNombre: string | null; fecha: string; observacionesSupervisor: string | null }[] = [];

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

  /*
  Pestaña "Términos" (pedido del usuario 2026-09-30): quién ya aceptó la Política de Privacidad/Términos de Uso
  (gate del primer login, ver terminos_aceptados_en) y quién todavía no - útil para que el Asistente audite
  cumplimiento sin tener que loguearse como cada persona. Reusa los MISMOS endpoints que ya existen (Directorio
  paginado de Operadores, lista de Usuarios de oficina) - terminos_aceptados_en ya venía en esas respuestas,
  solo faltaba tiparlo y mostrarlo en algún lado.
  */
  operadoresTerminos: Operador[] = [];
  terminosBusquedaTab: string = '';
  paginaTerminosTab: number = 1;
  totalPaginasTerminosTab: number = 1;
  totalTerminosTab: number = 0;
  private debounceTerminosTab?: ReturnType<typeof setTimeout>;
  // Usuarios de oficina (ADMIN/ASISTENTE/SUPERVISOR/ESCANER): lista corta, no hace falta paginar.
  usuariosTerminos: Usuario[] = [];

  /*
  "Importar desde Excel" (Equipo/Actividad, pedido del usuario 2026-09-29: tienen 300+ equipos y cargarlos uno
  por uno "se van a comer la camisa"). Mismo modal/flujo para ambos catálogos, cada uno con su propio estado
  para no mezclar un import a medias de uno con el del otro si el usuario cambia de pestaña. El parseo del
  .xlsx vive en el navegador (ver excel-importar.util.ts) - lo que se manda al backend ya es JSON.
  */
  mostrarModalImportarEquipo = false;
  importandoEquipos = false;
  errorImportarEquipo = '';
  filasParaImportarEquipo: { codigo_megued: string; nombre_equipo: string }[] = [];
  resultadoImportarEquipo: ResultadoImportacion | null = null;

  mostrarModalImportarActividad = false;
  importandoActividades = false;
  errorImportarActividad = '';
  filasParaImportarActividad: { codigo_megued: string; description: string; categoria: string }[] = [];
  resultadoImportarActividad: ResultadoImportacion | null = null;

  // Importar Trabajadores (Directorio de Operadores) - 'supervisor' viaja como NOMBRE de texto libre, el
  // backend lo resuelve contra los Usuarios con cargo SUPERVISOR y de ahi deriva la hacienda automaticamente.
  mostrarModalImportarOperador = false;
  importandoOperadores = false;
  errorImportarOperador = '';
  filasParaImportarOperador: { nombre_completo: string; rol: string; codigo_megued: string; cedula: string; supervisor: string }[] = [];
  resultadoImportarOperador: ResultadoImportacion | null = null;

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
    this.asistenciaService.obtenerOperadoresPaginado(this.paginaActual, 20, this.terminoBusqueda || undefined).subscribe({
      next: (res) => {
        this.operadores = res.data || [];
        this.totalPaginas = res.totalPaginas || 1;
        this.totalOperadores = res.total || 0;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando operadores:', err)
    });
  }

  // BÚSQUEDA Y PAGINACIÓN (por servidor, ver cargarOperadores)
  onSearchChange(): void {
    if (this.debounceOperadores) clearTimeout(this.debounceOperadores);
    this.debounceOperadores = setTimeout(() => {
      this.paginaActual = 1;
      this.cargarOperadores();
    }, 300);
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
      this.paginaActual = nuevaPagina;
      this.cargarOperadores();
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

  /*
  window.open('', '_blank') solo tiene sentido en un navegador de escritorio: dentro del WebView de la app
  empaquetada (Capacitor), el WebView no implementa multi-ventana, así que Android lo interpreta como "abrir
  un enlace externo" y manda al usuario a elegir un navegador afuera de la app - de ahí quedaba atrapado sin
  poder volver (reportado probando el .apk real, ver CLAUDE.md "Empaquetado con Capacitor"). En la app nativa
  se comparte el QR como imagen via el selector nativo de Android (Share) en vez de intentar imprimir - de ahí
  puede guardarlo, enviarlo por WhatsApp, o abrirlo en un visor que sí tenga opción de imprimir.
  */
  async imprimirQR(): Promise<void> {
    if (!this.operadorSeleccionado || !this.qrCodeUrl) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = this.qrCodeUrl.split(',')[1];
        const nombreArchivo = `carnet-qr-${this.operadorSeleccionado.codigo_megued || this.operadorSeleccionado.id}.png`;
        const escrito = await Filesystem.writeFile({
          path: nombreArchivo,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title: `Carnet QR - ${this.operadorSeleccionado.nombre_completo}`,
          dialogTitle: 'Compartir o guardar carnet',
          files: [escrito.uri],
        });
      } catch (err) {
        this.notificacionService.error('No se pudo compartir el carnet QR.');
      }
      return;
    }

    const ventanaImpresion = window.open('', '_blank');
    if (ventanaImpresion) {
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
        this.abrirHojaActividades([{
          operador: reg.operador!,
          registros,
          haciendaNombre: this.resolverHaciendaJornada(reg.operador!, reg),
          fecha: reg.fecha,
          observacionesSupervisor: reg.observaciones ?? null,
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
  Parte las labores (ya vienen ordenadas por fecha y luego hora_inicio, ver obtenerRegistrosPorOperador) de UN
  operador en un grupo por cada día distinto que aparece - cada día trae su propia observación del Supervisor
  (reg.asistencia.observaciones), que es exactamente lo que hacía falta para que "Imprimir Hojas del rango"
  muestre el mismo pie que ya mostraba la hoja de un solo día (ver hojaGrupos más arriba).
  */
  private agruparPorDia(
    operador: Operador, registros: RegistroActividad[], haciendaNombre: string | null
  ): { operador: Operador; registros: RegistroActividad[]; haciendaNombre: string | null; fecha: string; observacionesSupervisor: string | null }[] {
    const grupos: { operador: Operador; registros: RegistroActividad[]; haciendaNombre: string | null; fecha: string; observacionesSupervisor: string | null }[] = [];
    for (const reg of registros) {
      const fecha = reg.asistencia?.fecha ?? '—';
      let grupoDelDia = grupos.find((g) => g.fecha === fecha);
      if (!grupoDelDia) {
        grupoDelDia = { operador, registros: [], haciendaNombre, fecha, observacionesSupervisor: reg.asistencia?.observaciones ?? null };
        grupos.push(grupoDelDia);
      }
      grupoDelDia.registros.push(reg);
    }
    // Un operador sin ninguna labor en el rango (pero que sí tiene una fila en el Historial filtrado) igual
    // necesita UN grupo vacío para no desaparecer de la impresión - antes "Sin labores registradas" ya cubría
    // este caso con un hojaFechaUnica null; ahora, sin ningún registro no hay de dónde sacar la fecha real, así
    // que se muestra igual con un marcador explícito en vez de ocultar al operador por completo.
    if (grupos.length === 0) {
      grupos.push({ operador, registros: [], haciendaNombre, fecha: 'Sin labores en el rango', observacionesSupervisor: null });
    }
    return grupos;
  }

  // Junta a todos los operadores distintos de la tabla del Historial YA FILTRADA (la página actual, no todo el
  // rango completo si hay más páginas), les arma la hoja de cada uno acotada al mismo rango Desde/Hasta activo,
  // y la parte en un grupo por día (ver agruparPorDia). Solo se habilita cuando el filtro de fecha está
  // completo (ver [disabled] en el template).
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
        // Rango de varios días: se muestra la hacienda PERMANENTE del operador (no tiene sentido mostrar una
        // sola hacienda "de préstamo" cuando el rango puede cruzar varios días distintos).
        map((registros) => this.agruparPorDia(op, registros, this.resolverHaciendaJornada(op)))
      )
    );

    forkJoin(peticiones).subscribe({
      next: (gruposPorOperador) => {
        this.cargandoReporteImpresion = false;
        this.abrirHojaActividades(gruposPorOperador.flat(), { autoImprimir: true });
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al generar las hojas del rango.');
        this.cdr.detectChanges();
      },
    });
  }

  /*
  ==================== "Exportar a Excel" (Historial) ====================
  Reporte SIEMPRE de un solo dia (asi lo manejan en papel) calcando el diseno real "REGISTRO DE LABORES
  DIARIAS" que ya usan - plantilla provista por el usuario, 2026-10-01. Requiere Fecha+Hacienda+Supervisor
  puntuales (ver puedeExportarExcel): sin eso no habria un unico RESPONSABLE para el encabezado, ni forma de
  evitar mezclar trabajadores de haciendas distintas en la misma hoja.
  */
  get puedeExportarExcel(): boolean {
    return !!this.fechaInicioFiltro
      && this.fechaInicioFiltro === this.fechaFinFiltro
      && this.haciendaIdFiltro !== null
      && this.supervisorIdFiltro !== null;
  }

  exportarExcelDiario(): void {
    if (!this.puedeExportarExcel || this.exportandoExcel) return;
    const fecha = this.fechaInicioFiltro;
    const hacienda = this.haciendas.find((h) => h.id === this.haciendaIdFiltro);
    const supervisor = this.supervisores.find((s) => s.id === this.supervisorIdFiltro);
    if (!hacienda || !supervisor) return;

    this.exportandoExcel = true;
    this.cdr.detectChanges();

    // Pedido aparte del Historial ya cargado en pantalla (y no this.historial): ese viene paginado de a 30, y
    // el reporte necesita a TODOS los trabajadores del dia completo, no solo la pagina actual (limite 100,
    // tope real del backend - ver obtenerHistorial - de sobra para la cuadrilla de un solo Supervisor en un dia).
    this.asistenciaService.obtenerHistorial(fecha, fecha, 1, 100, hacienda.id, undefined, supervisor.id).subscribe({
      next: (res) => {
        const operadoresUnicos = new Map<number, Operador>();
        for (const reg of res.data) {
          if (reg.operador && !operadoresUnicos.has(reg.operador_id)) {
            operadoresUnicos.set(reg.operador_id, reg.operador);
          }
        }
        if (operadoresUnicos.size === 0) {
          this.exportandoExcel = false;
          this.notificacionService.error('No hay trabajadores registrados ese día para esa Hacienda y Supervisor.');
          this.cdr.detectChanges();
          return;
        }

        const peticiones = Array.from(operadoresUnicos.values()).map((op) =>
          this.registroActividadService.obtenerPorOperador(op.id, fecha, fecha).pipe(
            map((registros) => ({ operador: op, registros }))
          )
        );
        forkJoin(peticiones).subscribe({
          next: (bloques) => this.generarYDescargarExcel(bloques, fecha, hacienda.nombre, supervisor.nombre_completo),
          error: (err) => {
            this.exportandoExcel = false;
            this.notificacionService.error(err.error?.message || 'Error al generar el Excel.');
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        this.exportandoExcel = false;
        this.notificacionService.error(err.error?.message || 'Error al generar el Excel.');
        this.cdr.detectChanges();
      },
    });
  }

  // "Tarea/Hrs" redondeado a la media hora mas cercana (pedido explicito del usuario, con sus propios
  // ejemplos): 1h45min (1.75h) -> 2, 1h20min (1.33h) -> 1.5. Redondeo normal a la mitad mas cercana.
  private redondearHoras(horas: number): number {
    return Math.round(horas * 2) / 2;
  }

  // Numero de semana ISO 8601 (lunes=inicio de semana, la semana 1 es la que contiene el primer jueves del
  // año) - mismo criterio que Excel/la plantilla real (semana 40 para el 29 de septiembre de 2026).
  private numeroSemanaISO(fecha: Date): number {
    const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
    const diaIso = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - diaIso);
    const inicioAño = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - inicioAño.getTime()) / 86400000 + 1) / 7);
  }

  // Sin tildes a proposito - misma convencion que ya usa la plantilla real del usuario ("Seccion",
  // "Descripcion", "transmision", todos sin acento).
  private readonly DIAS_SEMANA_ES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

  private async generarYDescargarExcel(
    bloques: { operador: Operador; registros: RegistroActividad[] }[],
    fecha: string,
    nombreHacienda: string,
    nombreSupervisor: string,
  ): Promise<void> {
    try {
      // 'fecha' es un string YYYY-MM-DD puro (sin hora) - se interpreta en UTC a proposito (new Date() de un
      // string asi SIEMPRE cae en UTC medianoche) para que el dia de la semana no cambie segun la zona horaria
      // de quien genera el reporte.
      const fechaDate = new Date(`${fecha}T00:00:00Z`);
      const diaSemana = this.DIAS_SEMANA_ES[fechaDate.getUTCDay()];
      const semana = this.numeroSemanaISO(fechaDate);
      const [anio, mes, dia] = fecha.split('-');
      const fechaDDMMYYYY = `${dia}${mes}${anio}`;

      const wb = new Workbook();
      const ws = wb.addWorksheet('Hoja1', { views: [{ showGridLines: false }] });

      // Anchos de columna (los que trae medidos la plantilla real; el resto se deja en un ancho razonable).
      const anchos = [6, 12, 8, 27.66, 10, 11.5, 9, 12.33, 12, 23.83, 16.33, 14.33, 12, 10, 32];
      anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      const BORDE_FINO = { style: 'thin' as const, color: { argb: 'FF000000' } };
      const BORDES_TODOS = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
      const FUENTE_BASE = { name: 'Aptos Narrow', size: 11 };
      const CENTRADO = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
      const AMARILLO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      const AZUL_CLARO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
      const VERDE_CLARO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      const VERDE_MEDIO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };
      const MORADO_CLARO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4DFEC' } };

      const celda = (coord: string, valor: unknown, opciones: { fill?: FillPattern; bold?: boolean; size?: number } = {}) => {
        const c = ws.getCell(coord);
        c.value = valor as CellValue;
        c.font = { ...FUENTE_BASE, bold: !!opciones.bold, size: opciones.size ?? FUENTE_BASE.size };
        c.alignment = CENTRADO;
        c.border = BORDES_TODOS;
        if (opciones.fill) c.fill = opciones.fill;
        return c;
      };

      // Logo (mismo que ya usa el resto de la app - manifest.json, icono PWA).
      try {
        const respLogo = await fetch('/logo-source.png');
        const bufferLogo = await respLogo.arrayBuffer();
        const base64Logo = btoa(new Uint8Array(bufferLogo).reduce((s, b) => s + String.fromCharCode(b), ''));
        const idImagen = wb.addImage({ base64: base64Logo, extension: 'png' });
        ws.mergeCells('A1:E2');
        ws.addImage(idImagen, 'A1:E2');
      } catch {
        // Si el logo no carga (ej. sin red), el Excel se genera igual, solo sin la imagen.
      }

      // Titulo
      ws.mergeCells('F1:O2');
      celda('F1', 'REGISTRO DE LABORES DIARIAS', { bold: true, size: 22 });

      // Encabezado: Responsable / Digitacion TTHH / Dia reportado / Semana / Area.
      celda('F3', 'RESPONSABLE:');
      ws.mergeCells('G3:J3'); celda('G3', nombreSupervisor);
      celda('K3', 'DIGITACION TTHH:');
      ws.mergeCells('L3:O3'); celda('L3', '');

      celda('F4', 'DIA REPORTADO:');
      ws.mergeCells('G4:J4'); celda('G4', diaSemana);

      celda('F5', 'SEMANA:');
      ws.mergeCells('G5:J5'); celda('G5', semana);

      celda('F6', 'AREA:');
      ws.mergeCells('G6:J6'); celda('G6', 'TALLER');

      // Encabezado de la tabla (fila 7).
      const ENCABEZADOS: [string, string, FillPattern | undefined][] = [
        ['A7', 'Nª', undefined],
        ['B7', 'Fecha', AMARILLO],
        ['C7', 'Cod.', AMARILLO],
        ['D7', 'Empleado', undefined],
        ['E7', 'Cod. Labor', AMARILLO],
        ['F7', 'Labor', undefined],
        ['G7', 'Seccion', AMARILLO],
        ['H7', 'Lote/AREA', undefined],
        ['I7', 'Cod Equipo&Implemento', AZUL_CLARO],
        ['J7', 'Descripcion Eq/Implem', AZUL_CLARO],
        ['K7', 'ETAPA DEL CULTIVO 1', AMARILLO],
        ['L7', 'ETAPA DEL CULTIVO 2', AMARILLO],
        ['M7', 'Rendimiento', AMARILLO],
        ['N7', 'Tarea/Hrs', AMARILLO],
        ['O7', 'OBSERVACION', AMARILLO],
      ];
      for (const [coord, texto, fill] of ENCABEZADOS) celda(coord, texto, { fill, bold: true });

      // Filas de datos: un bloque por trabajador, N° auto-incremental, A/B/C/D/O combinadas y centradas en
      // todo el bloque (pedido explicito del usuario - igual que en la plantilla real).
      let filaActual = 8;
      let numero = 1;
      for (const bloque of bloques) {
        const filaInicio = filaActual;
        const registros: (RegistroActividad | null)[] = bloque.registros.length > 0 ? bloque.registros : [null];

        for (const reg of registros) {
          const horas = reg?.hora_fin
            ? this.redondearHoras((new Date(reg.hora_fin).getTime() - new Date(reg.hora_inicio).getTime()) / 3600000)
            : '';
          celda(`E${filaActual}`, reg?.actividad?.codigo_megued || '');
          celda(`F${filaActual}`, reg?.actividad?.description || '');
          celda(`G${filaActual}`, 'AP06', { fill: AZUL_CLARO });
          celda(`H${filaActual}`, 'M&Reparacion');
          celda(`I${filaActual}`, reg?.equipo?.codigo_megued || '');
          celda(`J${filaActual}`, reg?.equipo?.nombre_equipo || '');
          celda(`K${filaActual}`, 'FIJOS DEL TALLER', { fill: VERDE_CLARO });
          celda(`L${filaActual}`, 'FIJOS DEL TALLER', { fill: VERDE_MEDIO });
          celda(`M${filaActual}`, '', { fill: MORADO_CLARO });
          celda(`N${filaActual}`, horas);
          filaActual++;
        }
        const filaFin = filaActual - 1;

        celda(`A${filaInicio}`, numero);
        celda(`B${filaInicio}`, new Date(`${fecha}T00:00:00Z`));
        ws.getCell(`B${filaInicio}`).numFmt = 'm/d/yy';
        celda(`C${filaInicio}`, bloque.operador.codigo_megued);
        celda(`D${filaInicio}`, bloque.operador.nombre_completo, { bold: true });
        celda(`O${filaInicio}`, ''); // Observacion: vacia a proposito, para que la editen despues.
        if (filaFin > filaInicio) {
          ws.mergeCells(`A${filaInicio}:A${filaFin}`);
          ws.mergeCells(`B${filaInicio}:B${filaFin}`);
          ws.mergeCells(`C${filaInicio}:C${filaFin}`);
          ws.mergeCells(`D${filaInicio}:D${filaFin}`);
          ws.mergeCells(`O${filaInicio}:O${filaFin}`);
        }
        numero++;
      }

      // Pie de firmas (igual que la plantilla real), dos filas despues de la ultima fila de datos.
      const filaFirma1 = filaActual + 1;
      const filaFirma2 = filaFirma1 + 1;
      ws.mergeCells(`A${filaFirma1}:D${filaFirma1}`); celda(`A${filaFirma1}`, 'FIRMA DEL RESPONSABLE', { bold: true });
      ws.mergeCells(`I${filaFirma1}:J${filaFirma1}`); celda(`I${filaFirma1}`, 'AUTORIZADO POR:', { bold: true });
      ws.mergeCells(`M${filaFirma1}:O${filaFirma1}`); celda(`M${filaFirma1}`, 'FIRMA DE TTHH', { bold: true });
      ws.mergeCells(`A${filaFirma2}:D${filaFirma2}`); celda(`A${filaFirma2}`, 'NOMBRE:');
      ws.mergeCells(`M${filaFirma2}:O${filaFirma2}`); celda(`M${filaFirma2}`, 'DIGITADO POR:');

      const buffer = await wb.xlsx.writeBuffer();
      const nombreArchivo = `TALLER ${nombreHacienda.toUpperCase()} ${fechaDDMMYYYY}.xlsx`;
      await this.descargarArchivoExcel(buffer as ArrayBuffer, nombreArchivo);
    } catch (err) {
      console.error('Error al generar el Excel:', err);
      this.notificacionService.error('No se pudo generar el archivo Excel. Intenta de nuevo.');
    } finally {
      this.exportandoExcel = false;
      this.cdr.detectChanges();
    }
  }

  /*
  Mismo patron que compartirHoja()/imprimirQR(): dentro del WebView de la app empaquetada no hay dialogo de
  descarga del navegador, asi que se escribe el archivo a Cache y se comparte via el selector nativo de
  Android (ahi lo pueden guardar, mandarlo por WhatsApp/correo, etc). En navegador de escritorio, la descarga
  normal via un link temporal.
  */
  private async descargarArchivoExcel(buffer: ArrayBuffer, nombreArchivo: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''));
      const escrito = await Filesystem.writeFile({ path: nombreArchivo, data: base64, directory: Directory.Cache });
      await Share.share({
        title: nombreArchivo,
        dialogTitle: 'Compartir o guardar Excel',
        files: [escrito.uri],
      });
      return;
    }
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  /*
  Antes redondeaba a minutos enteros (Math.round) y descartaba los segundos - una labor de, ej., 40 segundos
  se mostraba como "0min", pareciendo mal calculada. Ahora se calcula con el total de segundos reales, sin
  redondear nada hasta el ultimo paso (truncar, no redondear - "47min 59s" no debe saltar a "48min").
  */
  duracionLabor(reg: RegistroActividad): string {
    if (!reg.hora_fin) return '—';
    const totalSegundos = Math.floor((new Date(reg.hora_fin).getTime() - new Date(reg.hora_inicio).getTime()) / 1000);
    if (totalSegundos < 0) return '—';
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) return `${horas}h ${minutos}min ${segundos}s`;
    if (minutos > 0) return `${minutos}min ${segundos}s`;
    return `${segundos}s`;
  }

  /*
  Reemplaza la columna "Taller/Campo" de la hoja imprimible (pedido del usuario, 2026-09-29): esa columna
  mostraba `actividad.categoria`, un dato FIJO del catálogo (lo define el Asistente al crear la Actividad, no
  algo que el Mecánico escriba por labor) - "Tiempo estimado" ya muestra la duración, pero nunca a qué hora
  empezó/terminó cada labor. hora_inicio/hora_fin ya viven en cada RegistroActividad (ver Panel de Actividades).
  */
  rangoHorasLabor(reg: RegistroActividad): string {
    const formato = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', {
      timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return `${formato(reg.hora_inicio)} - ${reg.hora_fin ? formato(reg.hora_fin) : '—'}`;
  }

  // Hacienda a mostrar junto al nombre en la hoja imprimible (reemplaza el codigo_megued, que ya se repite en
  // el carnet/QR - ver CLAUDE.md). Prioriza la hacienda de PRÉSTAMO de esa jornada puntual (si la asistencia la
  // tiene, ver hacienda_prestamo_id) sobre la hacienda PERMANENTE del operador (vía su Supervisor).
  private resolverHaciendaJornada(operador: Operador, asistencia?: Asistencia): string | null {
    return asistencia?.haciendaPrestamo?.nombre
      || operador.supervisor?.hacienda?.nombre
      || null;
  }

  private abrirHojaActividades(
    grupos: { operador: Operador; registros: RegistroActividad[]; haciendaNombre: string | null; fecha: string; observacionesSupervisor: string | null }[],
    opciones: { autoImprimir: boolean }
  ): void {
    this.hojaGrupos = grupos;
    this.mostrarModalHoja = true;
    this.cdr.detectChanges();

    // El print tiene que dispararse despues de que el modal ya este pintado en el DOM.
    if (opciones.autoImprimir) {
      setTimeout(() => this.imprimirHoja(), 150);
    }
  }

  /*
  window.print() no hace nada dentro del WebView de la app empaquetada - a diferencia de un navegador de
  escritorio, el WebView de Android no trae integrado el dialogo de impresion (ni Chrome ni Capacitor lo
  agregan solos), asi que los botones "Imprimir" quedaban sin efecto visible al tocarlos en el celular
  (reportado probando el .apk real). En nativo se comparte un resumen en texto plano via el selector nativo
  de Android en su lugar (enviar por WhatsApp/correo, o pegarlo en cualquier app) - la vista previa en pantalla
  (el modal, que sí funciona igual en ambos) sigue siendo la forma real de "ver" la hoja.
  */
  imprimirHoja(): void {
    if (Capacitor.isNativePlatform()) {
      this.compartirHoja();
      return;
    }
    window.print();
  }

  private async compartirHoja(): Promise<void> {
    try {
      await Share.share({
        title: 'Reporte de labores',
        dialogTitle: 'Compartir reporte',
        text: this.generarTextoHoja(),
      });
    } catch (err) {
      this.notificacionService.error('No se pudo compartir el reporte.');
    }
  }

  private generarTextoHoja(): string {
    const lineas: string[] = [];
    for (const grupo of this.hojaGrupos) {
      const esOperador = grupo.operador.rol === 'OPERADOR';
      lineas.push(esOperador ? 'REPORTE DE LABORES MAQUINARIAS' : 'REPORTE DE LABORES DIARIOS');
      lineas.push(
        `${esOperador ? 'Operador' : 'Mecánico'}: ${grupo.operador.nombre_completo}` +
          (grupo.haciendaNombre ? ` · ${grupo.haciendaNombre}` : '')
      );
      lineas.push(`Fecha: ${grupo.fecha}`);
      lineas.push('');

      if (grupo.registros.length === 0) {
        lineas.push('Sin labores registradas.');
      } else {
        for (const reg of grupo.registros) {
          const equipo = reg.equipo ? `${reg.equipo.codigo_megued} - ${reg.equipo.nombre_equipo}` : '—';
          const detalle = esOperador
            ? `Horómetro ${reg.horometro_inicio ?? '—'} → ${reg.horometro_final ?? '—'}`
            : `OT ${reg.area || '—'}`;
          const observaciones = reg.observaciones ? ` | ${reg.observaciones}` : '';
          const horas = esOperador ? '' : ` | ${this.rangoHorasLabor(reg)}`;
          lineas.push(`${equipo} | ${detalle} | ${this.duracionLabor(reg)}${horas}${observaciones}`);
        }
      }

      lineas.push('');
      lineas.push(`Observaciones del Supervisor: ${grupo.observacionesSupervisor || 'Sin observaciones.'}`);
      lineas.push('');
    }
    return lineas.join('\n').trim();
  }

  cerrarModalHoja(): void {
    this.mostrarModalHoja = false;
    this.hojaGrupos = [];
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

  cambiarTab(tab:'directorio' | 'historial' | 'equipos' | 'actividades' | 'terminos'):void{
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
    if(tab === 'terminos' && this.operadoresTerminos.length === 0){
      this.buscarTerminosTab();
      this.cargarUsuariosTerminos();
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

  // ==================== PESTAÑA "TÉRMINOS" ====================

  onBuscarTerminosTab(): void {
    if (this.debounceTerminosTab) clearTimeout(this.debounceTerminosTab);
    this.debounceTerminosTab = setTimeout(() => this.buscarTerminosTab(), 300);
  }

  buscarTerminosTab(): void {
    this.paginaTerminosTab = 1;
    this.cargarPaginaTerminosTab();
  }

  cambiarPaginaTerminosTab(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasTerminosTab) {
      this.paginaTerminosTab = nuevaPagina;
      this.cargarPaginaTerminosTab();
    }
  }

  private cargarPaginaTerminosTab(): void {
    this.asistenciaService.obtenerOperadoresPaginado(this.paginaTerminosTab, 20, this.terminosBusquedaTab || undefined).subscribe({
      next: (res) => {
        this.operadoresTerminos = res.data || [];
        this.totalPaginasTerminosTab = res.totalPaginas || 1;
        this.totalTerminosTab = res.total || 0;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando operadores para Términos:', err),
    });
  }

  private cargarUsuariosTerminos(): void {
    this.usuarioService.obtenerUsuarios().subscribe({
      next: (data) => {
        this.usuariosTerminos = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando usuarios de oficina para Términos:', err),
    });
  }

  // ==================== IMPORTAR DESDE EXCEL (Equipo/Actividad) ====================

  abrirModalImportarEquipo(): void {
    this.mostrarModalImportarEquipo = true;
    this.filasParaImportarEquipo = [];
    this.resultadoImportarEquipo = null;
    this.errorImportarEquipo = '';
  }

  cerrarModalImportarEquipo(): void {
    this.mostrarModalImportarEquipo = false;
  }

  descargarPlantillaEquipos(): void {
    descargarPlantillaExcel('plantilla-equipos.xlsx', 'Equipos', ['Código Megued', 'Nombre del Equipo']);
  }

  // Lee el .xlsx elegido y lo deja en 'filasParaImportarEquipo' como vista previa - todavía no manda nada al
  // backend (eso lo hace confirmarImportarEquipos, un paso aparte a propósito para que el usuario vea CUÁNTAS
  // filas se leyeron antes de confirmar).
  async onArchivoEquiposSeleccionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    this.errorImportarEquipo = '';
    this.resultadoImportarEquipo = null;
    try {
      const filas = await leerFilasExcel<{ codigo_megued: string; nombre_equipo: string }>(archivo, [
        { clave: 'codigo_megued', encabezados: ['codigo megued', 'codigo', 'codigo_megued'] },
        { clave: 'nombre_equipo', encabezados: ['nombre del equipo', 'nombre equipo', 'nombre', 'nombre_equipo'] },
      ]);
      this.filasParaImportarEquipo = filas;
      if (filas.length === 0) {
        this.errorImportarEquipo = 'No se encontraron filas con datos - revisa que uses la plantilla y que las columnas tengan esos mismos encabezados.';
      }
    } catch {
      this.errorImportarEquipo = 'No se pudo leer el archivo. Asegúrate de que sea un .xlsx o .xls válido.';
    } finally {
      // Permite volver a elegir el MISMO archivo (ej. después de corregirlo) sin que el navegador ignore el cambio.
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  confirmarImportarEquipos(): void {
    if (this.filasParaImportarEquipo.length === 0) return;

    this.importandoEquipos = true;
    this.registroActividadService.importarEquipos(this.filasParaImportarEquipo).subscribe({
      next: (res) => {
        this.importandoEquipos = false;
        this.resultadoImportarEquipo = res;
        this.filasParaImportarEquipo = [];
        if (res.creados > 0) {
          this.notificacionService.exito(`${res.creados} equipo(s) importado(s) con éxito.`);
          this.cargarPaginaEquiposTab();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.importandoEquipos = false;
        this.notificacionService.error(err.error?.message || 'Error al importar los equipos.');
        this.cdr.detectChanges();
      },
    });
  }

  abrirModalImportarOperador(): void {
    this.mostrarModalImportarOperador = true;
    this.filasParaImportarOperador = [];
    this.resultadoImportarOperador = null;
    this.errorImportarOperador = '';
  }

  cerrarModalImportarOperador(): void {
    this.mostrarModalImportarOperador = false;
  }

  descargarPlantillaOperadores(): void {
    descargarPlantillaExcel('plantilla-trabajadores.xlsx', 'Trabajadores', ['NOMBRE', 'CARGO', 'CODIGO', 'CEDULA', 'SUPERVISOR']);
  }

  async onArchivoOperadoresSeleccionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    this.errorImportarOperador = '';
    this.resultadoImportarOperador = null;
    try {
      const filas = await leerFilasExcel<{ nombre_completo: string; rol: string; codigo_megued: string; cedula: string; supervisor: string }>(archivo, [
        { clave: 'nombre_completo', encabezados: ['nombre', 'nombre completo', 'nombre_completo'] },
        { clave: 'rol', encabezados: ['cargo', 'rol'] },
        { clave: 'codigo_megued', encabezados: ['codigo', 'codigo megued', 'codigo_megued'] },
        { clave: 'cedula', encabezados: ['cedula'] },
        { clave: 'supervisor', encabezados: ['supervisor'] },
      ]);
      this.filasParaImportarOperador = filas;
      if (filas.length === 0) {
        this.errorImportarOperador = 'No se encontraron filas con datos - revisa que uses la plantilla y que las columnas tengan esos mismos encabezados.';
      }
    } catch {
      this.errorImportarOperador = 'No se pudo leer el archivo. Asegúrate de que sea un .xlsx o .xls válido.';
    } finally {
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  confirmarImportarOperadores(): void {
    if (this.filasParaImportarOperador.length === 0) return;

    this.importandoOperadores = true;
    this.asistenciaService.importarOperadores(this.filasParaImportarOperador).subscribe({
      next: (res) => {
        this.importandoOperadores = false;
        this.resultadoImportarOperador = res;
        this.filasParaImportarOperador = [];
        if (res.creados > 0) {
          this.notificacionService.exito(`${res.creados} trabajador(es) importado(s) con éxito.`);
          this.cargarOperadores();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.importandoOperadores = false;
        this.notificacionService.error(err.error?.message || 'Error al importar los trabajadores.');
        this.cdr.detectChanges();
      },
    });
  }

  abrirModalImportarActividad(): void {
    this.mostrarModalImportarActividad = true;
    this.filasParaImportarActividad = [];
    this.resultadoImportarActividad = null;
    this.errorImportarActividad = '';
  }

  cerrarModalImportarActividad(): void {
    this.mostrarModalImportarActividad = false;
  }

  descargarPlantillaActividades(): void {
    descargarPlantillaExcel('plantilla-actividades.xlsx', 'Actividades', ['Código Megued', 'Descripción', 'Categoría (TALLER o CAMPO)']);
  }

  async onArchivoActividadesSeleccionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    this.errorImportarActividad = '';
    this.resultadoImportarActividad = null;
    try {
      const filas = await leerFilasExcel<{ codigo_megued: string; description: string; categoria: string }>(archivo, [
        { clave: 'codigo_megued', encabezados: ['codigo megued', 'codigo', 'codigo_megued'] },
        { clave: 'description', encabezados: ['descripcion', 'description'] },
        { clave: 'categoria', encabezados: ['categoria (taller o campo)', 'categoria', 'categoria_taller_o_campo'] },
      ]);
      this.filasParaImportarActividad = filas;
      if (filas.length === 0) {
        this.errorImportarActividad = 'No se encontraron filas con datos - revisa que uses la plantilla y que las columnas tengan esos mismos encabezados.';
      }
    } catch {
      this.errorImportarActividad = 'No se pudo leer el archivo. Asegúrate de que sea un .xlsx o .xls válido.';
    } finally {
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  confirmarImportarActividades(): void {
    if (this.filasParaImportarActividad.length === 0) return;

    this.importandoActividades = true;
    this.asistenciaService.importarActividades(this.filasParaImportarActividad).subscribe({
      next: (res) => {
        this.importandoActividades = false;
        this.resultadoImportarActividad = res;
        this.filasParaImportarActividad = [];
        if (res.creados > 0) {
          this.notificacionService.exito(`${res.creados} actividad(es) importada(s) con éxito.`);
          this.cargarPaginaActividadesTab();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.importandoActividades = false;
        this.notificacionService.error(err.error?.message || 'Error al importar las actividades.');
        this.cdr.detectChanges();
      },
    });
  }
}
