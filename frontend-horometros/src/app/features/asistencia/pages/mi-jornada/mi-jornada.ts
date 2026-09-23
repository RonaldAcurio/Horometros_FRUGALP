import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { RegistroActividadService } from '../../../../core/services/registro-actividad.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { Equipo, Actividad, RegistroActividad } from '../../../../core/models/asistencia.model';

type FaseJornada = 'cargando' | 'codigo' | 'qr' | 'actividades' | 'terminado';

/*
Pantalla unica y cautiva del rol MECANICO/OPERADOR (ver CLAUDE.md, "Camino A vs Camino B"). No hay menu: el login
ya decidio (perfil.hacienda_requiere_codigo) cual de los 2 caminos le toca a este trabajador, y esta pantalla solo
recorre las fases de ESE camino, sin ofrecer nunca el otro:
- 'codigo' (hacienda CON Token vigente): confirma el codigo, marca al instante y termina (igual que el kiosco).
- 'qr' (hacienda SIN token vigente): QR flotante de 90s, obligatorio, hasta que un Supervisor/Escaner lo escanee.
- 'actividades' (solo llegan aqui los del camino QR, una vez escaneados): Panel de Actividades de su jornada.
*/
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-mi-jornada',
  styleUrl: './mi-jornada.css',
  templateUrl: './mi-jornada.html',
})
export class MiJornada implements OnInit, OnDestroy {
  fase: FaseJornada = 'cargando';
  esMecanico = true;
  mensajeFinal = '';

  // --- Fase codigo ---
  codigoIngresado = '';
  procesandoCodigo = false;
  errorCodigo = '';
  pidiendoActividadSalida = false;
  actividadesCatalogo: Actividad[] = [];
  actividadesSeleccionadasSalida: number[] = [];

  // --- Fase qr ---
  qrCodeUrl = '';
  segundosRestantes = 90;
  private intervaloQr?: ReturnType<typeof setInterval>;
  private cuentaRegresiva?: ReturnType<typeof setInterval>;

  // --- Fase actividades ---
  asistenciaId: number | null = null;
  registros: RegistroActividad[] = [];

  /*
  Los selectores de equipo/actividad del formulario son autocompletar: el trabajador escribe y van apareciendo
  las coincidencias (el catalogo puede crecer con el tiempo, no tiene sentido mostrarlo entero en un <select>).
  Cada busqueda pide la pagina 1 filtrada por el texto (con debounce); "Cargar más" dentro de la misma búsqueda
  acumula la siguiente página. Elegir una opción llena el id real (nuevoRegistro.equipo_id/actividad_id); el
  texto del input es solo lo que se está buscando o lo ya elegido - cambiar el texto sin volver a elegir borra
  la selección anterior, para no mandar un id que ya no corresponde a lo que se ve escrito.
  */
  equipos: Equipo[] = [];
  equipoBusqueda = '';
  mostrarOpcionesEquipo = false;
  equiposPagina = 0;
  equiposTotalPaginas = 1;
  cargandoMasEquipos = false;
  private debounceEquipo?: ReturnType<typeof setTimeout>;

  // (actividadesCatalogo, declarado arriba en "Fase codigo": catalogo COMPLETO sin paginar, para el checklist
  // de salida - ahi se necesita ver todo de una vez, no tiene el problema de escala de un autocompletar.)

  // Catalogo paginado/buscable de actividades para el selector del Panel de Actividades (independiente del de
  // arriba, mismo patron que equipos).
  actividadesCatalogoPanel: Actividad[] = [];
  actividadBusqueda = '';
  mostrarOpcionesActividad = false;
  actividadesPanelPagina = 0;
  actividadesPanelTotalPaginas = 1;
  cargandoMasActividadesPanel = false;
  private debounceActividad?: ReturnType<typeof setTimeout>;
  nuevoRegistro = { equipo_id: null as number | null, actividad_id: null as number | null, area: '', observaciones: '' };
  guardandoRegistro = false;

  /*
  Hora de inicio: DOS <input type="number"> (HH y MM) en vez de un <input type="time"> nativo. Se detectó un bug
  real de UX con el widget nativo: es un control compuesto de 3 "segmentos" internos (hora/minuto/am-pm) y un
  clic en CUALQUIER punto del input NO enfoca siempre el segmento de la hora - basta con que el clic caiga sobre
  el segmento de minutos o AM/PM para que lo que el trabajador teclee después vaya a ESE segmento, no a la hora
  que cree estar editando. El resultado: guarda una hora distinta a la que ve escrita, o el backend la rechaza
  por quedar antes de la hora de inicio ("no me deja poner la hora"). Dos inputs separados, cada uno con un solo
  propósito, eliminan la ambigüedad - confirmado con pruebas cruzando distintos puntos de clic dentro del widget
  nativo antes de decidir este cambio.
  */
  horaInicioHH: number | null = null;
  horaInicioMM: number | null = null;

  // Finalizar una labor pide la hora de fin (editable) en vez de imponer "ahora mismo" - el trabajador puede
  // estar cargando esto mas tarde, en su tiempo libre. Mismo patrón de dos inputs HH/MM que arriba.
  registroFinalizandoId: number | null = null;
  horaFinHH: number | null = null;
  horaFinMM: number | null = null;
  guardandoFinalizacion = false;

  // Poll continuo de mi-estado: detecta cuando lo escanean (entra a 'actividades') y cuando lo vuelven a
  // escanear para la salida (estado deja de ser EN_JORNADA -> jornada terminada).
  private intervaloEstado?: ReturnType<typeof setInterval>;

  constructor(
    private asistenciaService: AsistenciaService,
    private registroActividadService: RegistroActividadService,
    private authService: AuthService,
    private notificacionService: NotificacionService,
    private confirmacionService: ConfirmacionService,
    private cdr: ChangeDetectorRef,
  ) {}

  private requiereCodigo = false;

  ngOnInit(): void {
    const perfil = this.authService.perfil();
    this.esMecanico = perfil?.rol !== 'OPERADOR';
    this.requiereCodigo = !!perfil?.hacienda_requiere_codigo;

    /*
    Consultamos mi-estado ANTES de decidir la fase inicial: si el trabajador vuelve a entrar (refresco de
    pagina, o se desconecto y volvio) con una jornada YA abierta, no tiene sentido mostrarle de nuevo el QR o
    el codigo de ENTRADA por un instante antes de corregirse - eso es lo que pasaria si solo confiaramos en el
    polling de cada 5s (ver iniciarPollingEstado).
    */
    this.asistenciaService.obtenerMiEstado().subscribe({
      next: (res) => {
        if (res.en_jornada) {
          this.asistenciaId = res.asistencia_id;
          /*
          Jornada YA abierta (entrada nueva o refresco de pagina, código o QR): siempre al Panel de Actividades.
          La salida es una accion explicita del trabajador (boton "Marcar salida"), no algo que se infiera solo
          por volver a abrir la pantalla - igual para los dos caminos.
          */
          this.entrarAActividades();
        } else if (this.requiereCodigo) {
          this.fase = 'codigo';
          this.cargarCatalogoActividades();
        } else {
          this.iniciarFlujoQr();
        }
        this.iniciarPollingEstado();
        this.cdr.detectChanges();
      },
      error: () => {
        // Si la consulta inicial falla, seguimos con el camino normal (el polling ya corrige despues).
        if (this.requiereCodigo) { this.fase = 'codigo'; this.cargarCatalogoActividades(); }
        else { this.iniciarFlujoQr(); }
        this.iniciarPollingEstado();
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.detenerIntervalos();
    if (this.debounceEquipo) clearTimeout(this.debounceEquipo);
    if (this.debounceActividad) clearTimeout(this.debounceActividad);
  }

  private detenerIntervalos(): void {
    if (this.intervaloQr) clearInterval(this.intervaloQr);
    if (this.cuentaRegresiva) clearInterval(this.cuentaRegresiva);
    if (this.intervaloEstado) clearInterval(this.intervaloEstado);
  }

  private cargarCatalogoActividades(): void {
    this.asistenciaService.obtenerActividades().subscribe({
      next: (data) => { this.actividadesCatalogo = Array.isArray(data) ? data : []; this.cdr.detectChanges(); },
    });
  }

  // --- FASE CODIGO ---
  confirmarCodigo(actividadesIds?: number[]): void {
    if (!this.codigoIngresado.trim() && !actividadesIds) return;

    this.procesandoCodigo = true;
    this.errorCodigo = '';
    this.asistenciaService.marcarConMiCodigo(this.codigoIngresado.trim(), actividadesIds).subscribe({
      next: (res) => {
        this.procesandoCodigo = false;
        this.pidiendoActividadSalida = false;
        /*
        La ENTRADA por código lleva al Panel de Actividades, igual que el camino QR - el código solo reemplaza
        la forma de marcar presencia, no le quita al trabajador la posibilidad de registrar sus labores del día.
        La SALIDA (tipo === 'SALIDA', ya seleccionó actividades arriba) sigue terminando la jornada de una vez,
        como el kiosco de siempre.
        */
        if (res.tipo === 'ENTRADA') {
          this.asistenciaId = res.asistencia?.id ?? null;
          this.notificacionService.exito(res.message || 'Entrada registrada.');
          this.entrarAActividades();
        } else {
          this.mensajeFinal = res.message || 'Marcación registrada.';
          this.fase = 'terminado';
          this.detenerIntervalos();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.procesandoCodigo = false;
        if (err.status === 400 && err.error?.require_actividad) {
          this.pidiendoActividadSalida = true;
          this.cdr.detectChanges();
          return;
        }
        this.errorCodigo = err.error?.message || 'No se pudo procesar el código.';
        this.cdr.detectChanges();
      },
    });
  }

  toggleActividadSalida(id: number, marcada: boolean): void {
    if (marcada) {
      if (!this.actividadesSeleccionadasSalida.includes(id)) this.actividadesSeleccionadasSalida.push(id);
    } else {
      this.actividadesSeleccionadasSalida = this.actividadesSeleccionadasSalida.filter(a => a !== id);
    }
    this.cdr.detectChanges();
  }

  confirmarSalidaConActividad(): void {
    if (this.actividadesSeleccionadasSalida.length === 0) return;
    this.confirmarCodigo(this.actividadesSeleccionadasSalida);
  }

  // --- FASE QR ---
  private iniciarFlujoQr(): void {
    this.fase = 'qr';
    this.refrescarQr();
    this.intervaloQr = setInterval(() => this.refrescarQr(), 80000);
    this.cuentaRegresiva = setInterval(() => {
      this.segundosRestantes = this.segundosRestantes > 0 ? this.segundosRestantes - 1 : 0;
      this.cdr.detectChanges();
    }, 1000);
  }

  private refrescarQr(): void {
    this.asistenciaService.generarMiQr().subscribe({
      next: async (res) => {
        this.qrCodeUrl = await QRCode.toDataURL(res.qr_token, { width: 260, margin: 2 });
        this.segundosRestantes = res.vigencia_segundos || 90;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error generando el QR de jornada:', err),
    });
  }

  // --- POLLING DE ESTADO (comun a las 2 fases activas) ---
  private iniciarPollingEstado(): void {
    this.intervaloEstado = setInterval(() => this.consultarEstado(), 5000);
  }

  private consultarEstado(): void {
    /*
    La transicion se decide por el estado REAL (asistenciaId conocido o no), no por en que fase visual estamos -
    asi funciona igual sin importar si el trabajador ya hizo click en "mostrar QR de salida" o no.
    */
    this.asistenciaService.obtenerMiEstado().subscribe({
      next: (res) => {
        if (res.en_jornada && !this.asistenciaId) {
          // Recien lo escanearon/marcaron para la ENTRADA.
          this.asistenciaId = res.asistencia_id;
          if (this.fase === 'qr') this.entrarAActividades();
        } else if (!res.en_jornada && this.asistenciaId) {
          // Recien lo escanearon para la SALIDA (ya tenia una jornada abierta).
          this.mensajeFinal = 'Tu salida fue registrada. ¡Hasta luego!';
          this.fase = 'terminado';
          this.detenerIntervalos();
          this.cdr.detectChanges();
        }
      },
      error: (err) => console.error('Error consultando mi estado:', err),
    });
  }

  // --- FASE ACTIVIDADES (Panel de Actividades) ---

  // HH/MM actuales (hora LOCAL del dispositivo) para precargar los inputs de Hora de inicio/fin.
  private horaActualComponentes(fecha: Date = new Date()): { hh: number; mm: number } {
    return { hh: fecha.getHours(), mm: fecha.getMinutes() };
  }

  /*
  Combina HH/MM (de los inputs numéricos) con la fecha de HOY usando setHours (hora LOCAL del navegador, que es
  justo lo que el trabajador quiso decir) para obtener un instante real, y lo manda como ISO (con Z) al backend -
  si se mandara "HH:mm" tal cual, allá `new Date(...)` lo interpretaría distinto (fecha epoch + hora local del
  SERVIDOR, otra zona horaria), desfasando lo guardado. Clampa valores fuera de rango por si el navegador no
  valida estrictamente min/max de un <input type="number">.
  */
  private horaComponentesAIso(hh: number | null, mm: number | null): string | undefined {
    if (hh === null || hh === undefined || mm === null || mm === undefined || isNaN(hh) || isNaN(mm)) return undefined;
    const horas = Math.min(23, Math.max(0, Math.trunc(hh)));
    const minutos = Math.min(59, Math.max(0, Math.trunc(mm)));
    const fecha = new Date();
    fecha.setHours(horas, minutos, 0, 0);
    return fecha.toISOString();
  }

  private entrarAActividades(): void {
    this.fase = 'actividades';
    if (this.intervaloQr) clearInterval(this.intervaloQr);
    if (this.cuentaRegresiva) clearInterval(this.cuentaRegresiva);
    this.notificacionService.exito('¡Ya te registraron! Bienvenido a tu jornada.');
    const { hh, mm } = this.horaActualComponentes();
    this.horaInicioHH = hh;
    this.horaInicioMM = mm;
    this.cargarDatosActividades();
  }

  private cargarDatosActividades(): void {
    this.cargarPaginaEquipos(true);
    this.cargarPaginaActividadesPanel(true);
    this.cargarRegistros();
  }

  // --- Autocompletar de Equipo ---

  abrirOpcionesEquipo(): void {
    this.mostrarOpcionesEquipo = true;
    if (this.equipos.length === 0) this.cargarPaginaEquipos(true);
    this.cdr.detectChanges();
  }

  // Cierra el desplegable con un pequeño retraso para que el (click) de una opción registre antes del (blur).
  cerrarOpcionesEquipoConRetraso(): void {
    setTimeout(() => { this.mostrarOpcionesEquipo = false; this.cdr.detectChanges(); }, 200);
  }

  onBuscarEquipo(texto: string): void {
    this.equipoBusqueda = texto;
    this.nuevoRegistro.equipo_id = null;
    this.mostrarOpcionesEquipo = true;
    if (this.debounceEquipo) clearTimeout(this.debounceEquipo);
    this.debounceEquipo = setTimeout(() => this.cargarPaginaEquipos(true), 300);
    this.cdr.detectChanges();
  }

  seleccionarEquipo(eq: Equipo): void {
    this.nuevoRegistro.equipo_id = eq.id;
    this.equipoBusqueda = `${eq.codigo_megued} - ${eq.nombre_equipo}`;
    this.mostrarOpcionesEquipo = false;
    this.cdr.detectChanges();
  }

  // "Cargar más" dentro de la búsqueda actual: acumula la siguiente página en vez de reemplazar.
  cargarMasEquipos(): void {
    this.cargarPaginaEquipos(false);
  }

  // reemplazar=true: primera página de una búsqueda nueva (o carga inicial). false: "Cargar más" acumula.
  private cargarPaginaEquipos(reemplazar: boolean): void {
    if (this.cargandoMasEquipos) return;
    if (!reemplazar && this.equiposPagina > 0 && this.equiposPagina >= this.equiposTotalPaginas) return;
    this.cargandoMasEquipos = true;
    const siguiente = reemplazar ? 1 : this.equiposPagina + 1;
    this.registroActividadService.obtenerEquipos(siguiente, 20, this.equipoBusqueda).subscribe({
      next: (res) => {
        this.equipos = reemplazar ? res.data : [...this.equipos, ...res.data];
        this.equiposPagina = res.pagina;
        this.equiposTotalPaginas = res.totalPaginas;
        this.cargandoMasEquipos = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando equipos:', err);
        this.cargandoMasEquipos = false;
        this.cdr.detectChanges();
      },
    });
  }

  // --- Autocompletar de Actividad (Panel de Actividades - catalogo independiente del checklist de salida del
  // camino codigo, que sigue usando actividadesCatalogo sin paginar/buscar) ---

  abrirOpcionesActividad(): void {
    this.mostrarOpcionesActividad = true;
    if (this.actividadesCatalogoPanel.length === 0) this.cargarPaginaActividadesPanel(true);
    this.cdr.detectChanges();
  }

  cerrarOpcionesActividadConRetraso(): void {
    setTimeout(() => { this.mostrarOpcionesActividad = false; this.cdr.detectChanges(); }, 200);
  }

  onBuscarActividad(texto: string): void {
    this.actividadBusqueda = texto;
    this.nuevoRegistro.actividad_id = null;
    this.mostrarOpcionesActividad = true;
    if (this.debounceActividad) clearTimeout(this.debounceActividad);
    this.debounceActividad = setTimeout(() => this.cargarPaginaActividadesPanel(true), 300);
    this.cdr.detectChanges();
  }

  seleccionarActividad(act: Actividad): void {
    this.nuevoRegistro.actividad_id = act.id;
    this.actividadBusqueda = `${act.codigo_megued} - ${act.description}`;
    this.mostrarOpcionesActividad = false;
    this.cdr.detectChanges();
  }

  cargarMasActividadesPanel(): void {
    this.cargarPaginaActividadesPanel(false);
  }

  private cargarPaginaActividadesPanel(reemplazar: boolean): void {
    if (this.cargandoMasActividadesPanel) return;
    if (!reemplazar && this.actividadesPanelPagina > 0 && this.actividadesPanelPagina >= this.actividadesPanelTotalPaginas) return;
    this.cargandoMasActividadesPanel = true;
    const siguiente = reemplazar ? 1 : this.actividadesPanelPagina + 1;
    this.asistenciaService.obtenerActividadesPaginado(siguiente, 20, this.actividadBusqueda).subscribe({
      next: (res) => {
        this.actividadesCatalogoPanel = reemplazar ? res.data : [...this.actividadesCatalogoPanel, ...res.data];
        this.actividadesPanelPagina = res.pagina;
        this.actividadesPanelTotalPaginas = res.totalPaginas;
        this.cargandoMasActividadesPanel = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoMasActividadesPanel = false;
        this.cdr.detectChanges();
      },
    });
  }

  private cargarRegistros(): void {
    if (!this.asistenciaId) return;
    this.registroActividadService.obtenerPorAsistencia(this.asistenciaId).subscribe({
      next: (data) => { this.registros = data; this.cdr.detectChanges(); },
      error: (err) => console.error('Error cargando registros de actividad:', err),
    });
  }

  guardarNuevoRegistro(): void {
    if (!this.asistenciaId || !this.nuevoRegistro.equipo_id || !this.nuevoRegistro.actividad_id) return;
    if (this.horaInicioHH === null || this.horaInicioMM === null) return;

    this.guardandoRegistro = true;
    this.registroActividadService.crear({
      asistencia_id: this.asistenciaId,
      equipo_id: this.nuevoRegistro.equipo_id,
      actividad_id: this.nuevoRegistro.actividad_id,
      area: this.esMecanico ? this.nuevoRegistro.area : undefined,
      observaciones: this.nuevoRegistro.observaciones || undefined,
      hora_inicio: this.horaComponentesAIso(this.horaInicioHH, this.horaInicioMM),
    }).subscribe({
      next: () => {
        this.notificacionService.exito('Labor registrada.');
        this.nuevoRegistro = { equipo_id: null, actividad_id: null, area: '', observaciones: '' };
        const { hh, mm } = this.horaActualComponentes();
        this.horaInicioHH = hh;
        this.horaInicioMM = mm;
        this.equipoBusqueda = '';
        this.actividadBusqueda = '';
        this.guardandoRegistro = false;
        this.cargarRegistros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al registrar la labor.');
        this.guardandoRegistro = false;
        this.cdr.detectChanges();
      },
    });
  }

  // Abre el pequeño formulario inline (en la misma fila) para elegir la hora de fin, en vez de cerrarla al
  // instante con la hora del clic - el trabajador puede estar registrando esto despues, en su tiempo libre.
  abrirFinalizarRegistro(registro: RegistroActividad): void {
    this.registroFinalizandoId = registro.id;
    const { hh, mm } = this.horaActualComponentes();
    this.horaFinHH = hh;
    this.horaFinMM = mm;
    this.cdr.detectChanges();
  }

  cancelarFinalizarRegistro(): void {
    this.registroFinalizandoId = null;
    this.cdr.detectChanges();
  }

  confirmarFinalizarRegistro(): void {
    if (!this.registroFinalizandoId || this.horaFinHH === null || this.horaFinMM === null) return;

    this.guardandoFinalizacion = true;
    this.registroActividadService.finalizar(this.registroFinalizandoId, undefined, this.horaComponentesAIso(this.horaFinHH, this.horaFinMM)).subscribe({
      next: () => {
        this.notificacionService.exito('Labor finalizada.');
        this.registroFinalizandoId = null;
        this.guardandoFinalizacion = false;
        this.cargarRegistros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al finalizar la labor.');
        this.guardandoFinalizacion = false;
        this.cdr.detectChanges();
      },
    });
  }

  /*
  Termina la jornada desde el Panel de Actividades - el camino depende de cómo entró el trabajador: código
  vuelve a PEDIR el código de nuevo (no reutiliza el de la entrada - el código prueba presencia física en el
  momento, tanto a la entrada como a la salida) y luego elegir actividades si el backend lo exige; QR vuelve a
  mostrar el QR flotante para que lo escaneen. Nunca se mezclan los dos caminos dentro de una misma jornada.
  */
  marcarSalida(): void {
    if (this.requiereCodigo) {
      this.fase = 'codigo';
      this.pidiendoActividadSalida = false;
      this.codigoIngresado = '';
      this.errorCodigo = '';
      this.actividadesSeleccionadasSalida = [];
      this.cargarCatalogoActividades();
    } else {
      this.mostrarQrDeSalida();
    }
  }

  // Vuelve a mostrar el QR flotante para que lo escaneen y quede registrada la salida (obligatorio, no hay otra
  // forma de terminar la jornada).
  private mostrarQrDeSalida(): void {
    this.fase = 'qr';
    this.iniciarFlujoQr();
  }

  marcandoSalidaOlvidada = false;

  /*
  Autoservicio: cuando el trabajador ya no va a poder volver a un punto de escaneo ni reingresar el codigo (se le
  hizo tarde y ya se fue a su casa), cierra su propia jornada como SALIDA_OLVIDADA - antes solo el Supervisor
  podia hacerlo, en bloque, al cerrar el dia (ver CLAUDE.md).
  */
  async marcarMiSalidaOlvidada(): Promise<void> {
    const confirmado = await this.confirmacionService.preguntar(
      'Vas a cerrar tu jornada de hoy sin haber sido escaneado. Tu supervisor la revisará después. ¿Confirmas?',
      'Marcar salida olvidada'
    );
    if (!confirmado) return;

    this.marcandoSalidaOlvidada = true;
    this.asistenciaService.marcarSalidaOlvidada().subscribe({
      next: (res) => {
        this.mensajeFinal = res.message || 'Tu salida quedó marcada.';
        this.fase = 'terminado';
        this.detenerIntervalos();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'No se pudo marcar tu salida.');
        this.marcandoSalidaOlvidada = false;
        this.cdr.detectChanges();
      },
    });
  }

  cerrarSesion(): void {
    this.authService.logout();
  }
}
