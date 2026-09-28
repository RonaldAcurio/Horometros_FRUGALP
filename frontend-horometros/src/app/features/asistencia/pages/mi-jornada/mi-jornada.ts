import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { RegistroActividadService } from '../../../../core/services/registro-actividad.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { Equipo, Actividad, RegistroActividad } from '../../../../core/models/asistencia.model';
import { OperacionCrearLabor } from '../../../../core/models/offline.model';

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

  // --- Fase qr ---
  qrCodeUrl = '';
  segundosRestantes = 90;
  private intervaloQr?: ReturnType<typeof setInterval>;
  private cuentaRegresiva?: ReturnType<typeof setInterval>;

  // --- Fase actividades ---
  asistenciaId: number | null = null;
  // Vista combinada: lo que ya confirmó el servidor + lo que quedó guardado localmente sin sincronizar (ver
  // OfflineSyncService/recalcularVistaRegistros). Las pendientes de crear tienen id NEGATIVO a propósito.
  registros: RegistroActividad[] = [];
  private registrosServidor: RegistroActividad[] = [];
  private subCambiosOffline?: Subscription;

  /*
  Los selectores de equipo/actividad del formulario son autocompletar: el trabajador escribe y van apareciendo
  las coincidencias. Ya NO piden nada por red (antes pedían por página con debounce, ver historial en
  CLAUDE.md "offline real en el .apk") - filtran en el momento sobre el catálogo COMPLETO que OfflineSyncService
  ya tiene cacheado en el celular (equiposFiltrados/actividadesFiltradas abajo), así que la búsqueda funciona
  igual con o sin señal. Elegir una opción llena el id real (nuevoRegistro.equipo_id/actividad_id); el texto del
  input es solo lo que se está buscando o lo ya elegido - cambiar el texto sin volver a elegir borra la
  selección anterior, para no mandar un id que ya no corresponde a lo que se ve escrito.
  */
  private readonly MAX_RESULTADOS_AUTOCOMPLETAR = 30;
  equipoBusqueda = '';
  mostrarOpcionesEquipo = false;

  actividadBusqueda = '';
  mostrarOpcionesActividad = false;
  nuevoRegistro = { equipo_id: null as number | null, actividad_id: null as number | null, area: '', horometro_inicio: null as number | null, observaciones: '' };
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
  horometroFinal: number | null = null;
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
    protected offlineSyncService: OfflineSyncService,
    private cdr: ChangeDetectorRef,
  ) {}

  private requiereCodigo = false;

  ngOnInit(): void {
    const perfil = this.authService.perfil();
    this.esMecanico = perfil?.rol !== 'OPERADOR';
    this.requiereCodigo = !!perfil?.hacienda_requiere_codigo;

    // Cualquier cambio en la cola offline (se agregó algo, se sincronizó, volvió la señal) refresca la vista.
    this.subCambiosOffline = this.offlineSyncService.cambios$.subscribe(() => {
      if (this.asistenciaId) this.cargarRegistros();
    });

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
        } else {
          this.iniciarFlujoQr();
        }
        this.iniciarPollingEstado();
        this.cdr.detectChanges();
      },
      error: () => {
        /*
        Si la consulta inicial falla, NO adivinamos si ya esta en jornada o no (antes esto caia directo a
        'codigo'/'qr' como si asumiera que no - bug real: un trabajador que en verdad seguia EN_JORNADA volvia a
        ver la pantalla de entrada, y si volvia a marcar su código, el backend lo interpretaba como una SALIDA,
        cerrandole la jornada sin querer). Nos quedamos en 'cargando' (vista neutral, ver mi-jornada.html) y
        dejamos que el poll de 5s (consultarEstado) resuelva el estado real apenas la consulta funcione.
        */
        this.iniciarPollingEstado();
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.detenerIntervalos();
    this.subCambiosOffline?.unsubscribe();
  }

  private detenerIntervalos(): void {
    if (this.intervaloQr) clearInterval(this.intervaloQr);
    if (this.cuentaRegresiva) clearInterval(this.cuentaRegresiva);
    if (this.intervaloEstado) clearInterval(this.intervaloEstado);
  }

  // --- FASE CODIGO ---
  // Misma acción para ENTRADA y SALIDA - el backend decide cuál es según si el trabajador ya tenía una jornada
  // abierta, y si es SALIDA deriva las actividades directamente de lo que ya cargó en el Panel de Actividades
  // (ver marcarConMiCodigo/omitirActividadRequerida en el backend) - ya no hace falta pedirle elegir a mano.
  confirmarCodigo(): void {
    if (!this.codigoIngresado.trim()) return;

    this.procesandoCodigo = true;
    this.errorCodigo = '';
    this.asistenciaService.marcarConMiCodigo(this.codigoIngresado.trim()).subscribe({
      next: (res) => {
        this.procesandoCodigo = false;
        /*
        La ENTRADA por código lleva al Panel de Actividades, igual que el camino QR - el código solo reemplaza
        la forma de marcar presencia, no le quita al trabajador la posibilidad de registrar sus labores del día.
        La SALIDA (tipo === 'SALIDA') termina la jornada de una vez, como el kiosco de siempre.
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
        /*
        status 0 = fallo de RED real (sin señal), no el backend rechazando el código - la ENTRADA siempre
        necesita conexión (ver CLAUDE.md, "offline-first solo cubre Panel de Actividades"), así que acá no se
        encola nada, solo se avisa con un mensaje claro. Sin este chequeo, `err.error?.message` termina
        mostrando el texto crudo del error de red del WebView (ej. "Failed to fetch") tal cual - probado por el
        usuario en el .apk real con el internet apagado.
        */
        this.errorCodigo = err.status === 0
          ? 'Sin conexión a internet. Conéctate e intenta de nuevo.'
          : (err.error?.message || 'No se pudo procesar el código.');
        this.cdr.detectChanges();
      },
    });
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
          /*
          Recien lo escanearon/marcaron para la ENTRADA (QR), o recien pudimos confirmar el estado real tras un
          fallo de red en la consulta inicial que nos habia dejado en 'cargando' sin saber si ya estaba en
          jornada (ver ngOnInit) - en ambos casos toca pasar a Panel de Actividades. 'codigo' queda afuera a
          propósito: esa fase también se llega a mano desde "Marcar salida" (ver marcarSalida) mientras el
          trabajador todavía sigue EN_JORNADA hasta que confirme su código - el poll no debe sacarlo de ahí a
          mitad de eso.
          */
          this.asistenciaId = res.asistencia_id;
          if (this.fase === 'qr' || this.fase === 'cargando') this.entrarAActividades();
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
    // Refresca el catálogo cacheado por si cambió desde que arrancó la app (ver OfflineSyncService) - es un
    // "mejor esfuerzo" en silencio, no bloquea nada: si falla (sin señal) se sigue usando lo ya cacheado.
    this.offlineSyncService.refrescarCatalogos();
    this.cargarRegistros();
  }

  // --- Autocompletar de Equipo/Actividad ---
  // Filtran en el momento sobre el catálogo COMPLETO cacheado en OfflineSyncService (ver comentario de
  // equipoBusqueda arriba) - no piden nada por red, funcionan igual con o sin señal. Se limita a
  // MAX_RESULTADOS_AUTOCOMPLETAR para no pintar una lista larguísima de una sola vez; escribir más texto acota
  // sola la búsqueda, como cualquier autocompletar.

  get equiposFiltrados(): Equipo[] {
    const texto = this.equipoBusqueda.trim().toLowerCase();
    const catalogo = this.offlineSyncService.catalogoEquipos();
    const filtrados = texto
      ? catalogo.filter((eq) => eq.codigo_megued.toLowerCase().includes(texto) || eq.nombre_equipo.toLowerCase().includes(texto))
      : catalogo;
    return filtrados.slice(0, this.MAX_RESULTADOS_AUTOCOMPLETAR);
  }

  get actividadesFiltradas(): Actividad[] {
    const texto = this.actividadBusqueda.trim().toLowerCase();
    const catalogo = this.offlineSyncService.catalogoActividades();
    const filtradas = texto
      ? catalogo.filter((act) => act.codigo_megued.toLowerCase().includes(texto) || act.description.toLowerCase().includes(texto))
      : catalogo;
    return filtradas.slice(0, this.MAX_RESULTADOS_AUTOCOMPLETAR);
  }

  abrirOpcionesEquipo(): void {
    this.mostrarOpcionesEquipo = true;
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

  private cargarRegistros(): void {
    if (!this.asistenciaId) return;
    this.registroActividadService.obtenerPorAsistencia(this.asistenciaId).subscribe({
      next: (data) => { this.registrosServidor = data; this.recalcularVistaRegistros(); this.cdr.detectChanges(); },
      error: (err) => {
        console.error('Error cargando registros de actividad:', err);
        // Sin señal: igual mostramos lo que ya tengamos guardado localmente sin sincronizar.
        this.recalcularVistaRegistros();
        this.cdr.detectChanges();
      },
    });
  }

  // Junta lo que ya confirmó el servidor con lo que sigue pendiente de sincronizar de ESTA jornada (ver
  // OfflineSyncService) - las pendientes se arman con lo que el celular ya tenía cargado (equipo/actividad de
  // los catálogos), sin depender del servidor para poder mostrarlas.
  private recalcularVistaRegistros(): void {
    if (!this.asistenciaId) { this.registros = this.registrosServidor; return; }
    const pendientes = this.offlineSyncService
      .pendientesCrearDeAsistencia(this.asistenciaId)
      .map((op) => this.opACamposDeVista(op));
    this.registros = [...this.registrosServidor, ...pendientes];
  }

  private opACamposDeVista(op: OperacionCrearLabor): RegistroActividad {
    return {
      id: op.idLocal,
      asistencia_id: op.payload.asistencia_id,
      equipo_id: op.payload.equipo_id,
      actividad_id: op.payload.actividad_id,
      area: op.payload.area ?? null,
      horometro_inicio: op.payload.horometro_inicio ?? null,
      horometro_final: null,
      observaciones: op.payload.observaciones ?? null,
      hora_inicio: op.payload.hora_inicio ?? op.creadoEn,
      hora_fin: null,
      equipo: op.equipo,
      actividad: op.actividad,
    };
  }

  // Usado por el template para distinguir una fila todavía sin sincronizar (ver mi-jornada.html).
  esPendienteDeSincronizar(registroId: number): boolean {
    return registroId < 0;
  }

  guardarNuevoRegistro(): void {
    if (!this.asistenciaId || !this.nuevoRegistro.equipo_id || !this.nuevoRegistro.actividad_id) return;
    if (this.horaInicioHH === null || this.horaInicioMM === null) return;

    const payload = {
      asistencia_id: this.asistenciaId,
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
        /*
        status 0: la peticion nunca llego al servidor (sin señal) - se guarda localmente en vez de perderla.
        Cualquier otro status SI llego al servidor y este la rechazo (validacion, etc) - eso no se arregla
        reintentando despues, se le avisa al trabajador como error normal.
        */
        if (err.status === 0) {
          const equipoSel = this.offlineSyncService.catalogoEquipos().find((e) => e.id === payload.equipo_id);
          const actividadSel = this.offlineSyncService.catalogoActividades().find((a) => a.id === payload.actividad_id);
          this.offlineSyncService.encolarCrearLabor(payload, equipoSel, actividadSel).then(() => {
            this.notificacionService.exito('Sin señal: la labor quedó guardada en el celular y se sincroniza sola cuando vuelva la conexión.');
            this.limpiarFormularioNuevoRegistro();
            this.recalcularVistaRegistros();
            this.cdr.detectChanges();
          });
          return;
        }
        this.notificacionService.error(err.error?.message || 'Error al registrar la labor.');
        this.cdr.detectChanges();
      },
    });
  }

  private limpiarFormularioNuevoRegistro(): void {
    this.nuevoRegistro = { equipo_id: null, actividad_id: null, area: '', horometro_inicio: null, observaciones: '' };
    const { hh, mm } = this.horaActualComponentes();
    this.horaInicioHH = hh;
    this.horaInicioMM = mm;
    this.equipoBusqueda = '';
    this.actividadBusqueda = '';
  }

  // Abre el pequeño formulario inline (en la misma fila) para elegir la hora de fin, en vez de cerrarla al
  // instante con la hora del clic - el trabajador puede estar registrando esto despues, en su tiempo libre.
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
        if (err.status === 0) {
          this.offlineSyncService.encolarFinalizarLabor(id, undefined, horaFin, horometroFinal).then(() => {
            this.notificacionService.exito('Sin señal: el cierre quedó guardado en el celular y se sincroniza solo cuando vuelva la conexión.');
            this.registroFinalizandoId = null;
            this.cdr.detectChanges();
          });
          return;
        }
        this.notificacionService.error(err.error?.message || 'Error al finalizar la labor.');
        this.cdr.detectChanges();
      },
    });
  }

  // Botón manual "Sincronizar ahora" (diseño acordado: manual/periódico, no hay sync automático en segundo
  // plano - ver OfflineSyncService). También se dispara solo al volver la señal.
  sincronizarAhora(): void {
    this.offlineSyncService.sincronizar();
  }

  /*
  Termina la jornada desde el Panel de Actividades - el camino depende de cómo entró el trabajador: código
  vuelve a PEDIR el código de nuevo (no reutiliza el de la entrada - el código prueba presencia física en el
  momento, tanto a la entrada como a la salida; las actividades se derivan solas de lo ya cargado en el Panel,
  ver confirmarCodigo/backend); QR vuelve a mostrar el QR flotante para que lo escaneen. Nunca se mezclan los
  dos caminos dentro de una misma jornada.
  */
  marcarSalida(): void {
    if (this.requiereCodigo) {
      this.fase = 'codigo';
      this.codigoIngresado = '';
      this.errorCodigo = '';
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
