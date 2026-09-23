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
  Los selectores de equipo/actividad del formulario se cargan paginados (el catalogo puede crecer con el
  tiempo) y van acumulando paginas con "Cargar más" en vez de mostrar controles de pagina - dentro de un
  <select> nativo no tiene sentido "ir a la pagina anterior" a mitad de elegir una opcion.
  */
  equipos: Equipo[] = [];
  equiposPagina = 0;
  equiposTotalPaginas = 1;
  cargandoMasEquipos = false;

  // (actividadesCatalogo, declarado arriba en "Fase codigo": catalogo COMPLETO sin paginar, para el checklist
  // de salida - ahi se necesita ver todo de una vez, no tiene el problema de escala de un <select>.)

  // Catalogo paginado de actividades para el selector del Panel de Actividades (independiente del de arriba).
  actividadesCatalogoPanel: Actividad[] = [];
  actividadesPanelPagina = 0;
  actividadesPanelTotalPaginas = 1;
  cargandoMasActividadesPanel = false;
  nuevoRegistro = { equipo_id: null as number | null, actividad_id: null as number | null, area: '', observaciones: '', hora_inicio: '' };
  guardandoRegistro = false;
  // Finalizar una labor pide la hora de fin (editable) en vez de imponer "ahora mismo" - el trabajador puede
  // estar cargando esto mas tarde, en su tiempo libre.
  registroFinalizandoId: number | null = null;
  horaFinEditando = '';
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
          if (this.requiereCodigo) {
            // Camino codigo: ya marco entrada, lo que sigue es confirmar el codigo de salida directamente.
            this.fase = 'codigo';
            this.pidiendoActividadSalida = false;
            this.cargarCatalogoActividades();
          } else {
            this.entrarAActividades();
          }
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
        this.mensajeFinal = res.message || 'Marcación registrada.';
        this.fase = 'terminado';
        this.detenerIntervalos();
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

  // Formato que entiende <input type="time">: 'HH:mm', en hora LOCAL del dispositivo. Las labores siempre son
  // de HOY, asi que el input no necesita fecha (ni calendario que mostrar).
  private horaSoloParaInput(fecha: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
  }

  /*
  El valor de un <input type="time"> ("HH:mm") no lleva fecha ni zona horaria. Lo combinamos con la fecha de HOY
  usando setHours (hora LOCAL del navegador, que es justo lo que el trabajador quiso decir) para obtener un
  instante real, y lo mandamos como ISO (con Z) al backend - si se mandara el "HH:mm" tal cual, alla `new Date(...)`
  lo interpretaria distinto (fecha epoch + hora local del SERVIDOR, otra zona horaria), desfasando lo guardado.
  */
  private horaSoloAIso(horaHHmm: string): string | undefined {
    if (!horaHHmm) return undefined;
    const [horas, minutos] = horaHHmm.split(':').map(Number);
    const fecha = new Date();
    fecha.setHours(horas, minutos, 0, 0);
    return fecha.toISOString();
  }

  private entrarAActividades(): void {
    this.fase = 'actividades';
    if (this.intervaloQr) clearInterval(this.intervaloQr);
    if (this.cuentaRegresiva) clearInterval(this.cuentaRegresiva);
    this.notificacionService.exito('¡Ya te registraron! Bienvenido a tu jornada.');
    this.nuevoRegistro.hora_inicio = this.horaSoloParaInput();
    this.cargarDatosActividades();
  }

  private cargarDatosActividades(): void {
    this.cargarMasEquipos();
    this.cargarMasActividadesPanel();
    this.cargarRegistros();
  }

  // "Cargar más" del selector de Equipo: acumula la siguiente página en vez de reemplazar lo ya mostrado.
  cargarMasEquipos(): void {
    if (this.cargandoMasEquipos || (this.equiposPagina > 0 && this.equiposPagina >= this.equiposTotalPaginas)) return;
    this.cargandoMasEquipos = true;
    const siguiente = this.equiposPagina + 1;
    this.registroActividadService.obtenerEquipos(siguiente, 20).subscribe({
      next: (res) => {
        this.equipos = [...this.equipos, ...res.data];
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

  // "Cargar más" del selector de Actividad (Panel de Actividades) - catalogo independiente del checklist de
  // salida del camino codigo, que sigue usando actividadesCatalogo (sin paginar).
  cargarMasActividadesPanel(): void {
    if (this.cargandoMasActividadesPanel || (this.actividadesPanelPagina > 0 && this.actividadesPanelPagina >= this.actividadesPanelTotalPaginas)) return;
    this.cargandoMasActividadesPanel = true;
    const siguiente = this.actividadesPanelPagina + 1;
    this.asistenciaService.obtenerActividadesPaginado(siguiente, 20).subscribe({
      next: (res) => {
        this.actividadesCatalogoPanel = [...this.actividadesCatalogoPanel, ...res.data];
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

    this.guardandoRegistro = true;
    this.registroActividadService.crear({
      asistencia_id: this.asistenciaId,
      equipo_id: this.nuevoRegistro.equipo_id,
      actividad_id: this.nuevoRegistro.actividad_id,
      area: this.esMecanico ? this.nuevoRegistro.area : undefined,
      observaciones: this.nuevoRegistro.observaciones || undefined,
      hora_inicio: this.horaSoloAIso(this.nuevoRegistro.hora_inicio),
    }).subscribe({
      next: () => {
        this.notificacionService.exito('Labor registrada.');
        this.nuevoRegistro = { equipo_id: null, actividad_id: null, area: '', observaciones: '', hora_inicio: this.horaSoloParaInput() };
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
    this.horaFinEditando = this.horaSoloParaInput();
    this.cdr.detectChanges();
  }

  cancelarFinalizarRegistro(): void {
    this.registroFinalizandoId = null;
    this.cdr.detectChanges();
  }

  confirmarFinalizarRegistro(): void {
    if (!this.registroFinalizandoId || !this.horaFinEditando) return;

    this.guardandoFinalizacion = true;
    this.registroActividadService.finalizar(this.registroFinalizandoId, undefined, this.horaSoloAIso(this.horaFinEditando)).subscribe({
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

  // Vuelve a mostrar el QR flotante para que lo escaneen y quede registrada la salida (obligatorio, no hay otra
  // forma de terminar la jornada).
  mostrarQrDeSalida(): void {
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
