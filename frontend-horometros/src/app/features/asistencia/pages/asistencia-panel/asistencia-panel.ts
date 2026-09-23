import { Component, ChangeDetectorRef, OnInit, signal } from '@angular/core';
import { Operador, Asistencia, RegistroActividad } from '../../../../core/models/asistencia.model';
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
  tabActual: 'directorio' | 'historial' = 'directorio';
  historial: Asistencia[] = [];
  fechaInicioFiltro: string= '';
  fechaFinFiltro:string = '';
  // Filtro por hacienda: el Operador no tiene hacienda propia, se filtra via su Supervisor (ver backend).
  haciendas: Hacienda[] = [];
  haciendaIdFiltro: number | null = null;
  //Paginacion del historial: el backend nunca manda todo el rando de fechas de una sola vez
  paginaHistorial: number = 1;
  totalPaginasHistorial: number = 1;
  totalHistorial: number = 0;

  // Reporte imprimible "Ver/Imprimir" (Directorio de Operadores y fila del Historial): carga las labores de un
  // operador para mostrarlas con el mismo diseño de la hoja física "REPORTES DE LABORES DIARIOS".
  cargandoReporteImpresion = false;

  constructor(
    private asistenciaService: AsistenciaService,
    private usuarioService: UsuarioService,
    private registroActividadService: RegistroActividadService,
    private haciendaService: HaciendaService,
    private cdr: ChangeDetectorRef,
    private notificacionService: NotificacionService
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
  compartió (columnas FECHA/MECANICO/EQUIPO/AREA/DAÑO/TIEMPO ESTIMADO/TALLER-CAMPO). Sigue el mismo patrón que
  imprimirQR() - ventana nueva con HTML propio, sin depender de un componente de impresión aparte.

  Dos puntos de entrada:
  - Directorio de Operadores (`verImprimirHojaActividades`): historial COMPLETO de un operador (todas sus
    jornadas), combina ver+imprimir en un solo botón - se queda igual que antes.
  - Historial de Asistencia (`verHojaFilaHistorial`/`imprimirHojaFilaHistorial`): UN SOLO día puntual (la fila
    clicada), con "Ver" y "Imprimir" como acciones separadas - "Ver" abre la vista previa sin disparar el
    diálogo de impresión del navegador, "Imprimir" sí lo dispara de inmediato.
  */
  verImprimirHojaActividades(op: Operador): void {
    this.cargandoReporteImpresion = true;
    this.registroActividadService.obtenerPorOperador(op.id).subscribe({
      next: (registros) => {
        this.cargandoReporteImpresion = false;
        this.abrirVentanaHojaActividades(op, registros, true);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al cargar las labores del operador.');
        this.cdr.detectChanges();
      },
    });
  }

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
        this.abrirVentanaHojaActividades(reg.operador!, registros, autoImprimir);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al cargar las labores de ese día.');
        this.cdr.detectChanges();
      },
    });
  }

  private duracionLabor(reg: RegistroActividad): string {
    if (!reg.hora_fin) return '—';
    const minutos = Math.round((new Date(reg.hora_fin).getTime() - new Date(reg.hora_inicio).getTime()) / 60000);
    if (minutos < 0) return '—';
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return horas > 0 ? `${horas}h ${resto}min` : `${resto}min`;
  }

  private abrirVentanaHojaActividades(op: Operador, registros: RegistroActividad[], autoImprimir: boolean): void {
    const ventana = window.open('', '_blank');
    if (!ventana) return;

    // Mecánico va en el encabezado (siempre es UN solo operador por llamada) - así la tabla queda más parecida
    // a la hoja física, que solo repite Fecha por fila y escribe el nombre del mecánico una sola vez.
    const filas = registros.length > 0
      ? registros.map((reg) => `
          <tr>
            <td>${reg.asistencia?.fecha || '—'}</td>
            <td>${reg.equipo ? `${reg.equipo.codigo_megued} - ${reg.equipo.nombre_equipo}` : '—'}</td>
            <td>${reg.area || '—'}</td>
            <td>${reg.observaciones || '—'}</td>
            <td>${this.duracionLabor(reg)}</td>
            <td>${reg.actividad?.categoria || '—'}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="6" class="sin-registros">Sin labores registradas.</td></tr>`;

    ventana.document.write(`
      <html>
        <head>
          <title>Reporte de Labores - ${op.nombre_completo}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { font-size: 18px; text-transform: uppercase; margin-bottom: 4px; }
            .subtitulo { color: #4b5563; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #9ca3af; padding: 6px 8px; text-align: left; }
            th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
            .sin-registros { text-align: center; color: #6b7280; padding: 20px; }
            .barra-acciones { margin-bottom: 16px; }
            .barra-acciones button {
              background: #059669; color: #fff; border: none; border-radius: 6px;
              padding: 8px 16px; font-size: 13px; cursor: pointer;
            }
            @media print { .barra-acciones { display: none; } }
          </style>
        </head>
        <body>
          <div class="barra-acciones"><button onclick="window.print()">🖨️ Imprimir</button></div>
          <h1>Reportes de Labores Diarios</h1>
          <p class="subtitulo">Mecánico: ${op.nombre_completo}${op.codigo_megued ? ' · ' + op.codigo_megued : ''}</p>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Equipo</th>
                <th>Área</th>
                <th>Daño</th>
                <th>Tiempo estimado</th>
                <th>Taller/Campo</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
          ${autoImprimir ? '<script>window.print();</script>' : ''}
        </body>
      </html>
    `);
    ventana.document.close();
  }

  cambiarTab(tab:'directorio' | 'historial'):void{
    this.tabActual = tab;

    if(tab === 'historial' && this.historial.length === 0){
      this.buscarHistorial();
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
      this.haciendaIdFiltro || undefined
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
  
}
