import { Component, ChangeDetectorRef, OnInit, signal } from '@angular/core';
import { Operador, Asistencia } from '../../../../core/models/asistencia.model';
import * as QRCode from 'qrcode';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { UsuarioService } from '../../../../core/services/usuario.service';
import { Usuario } from '../../../../core/models/usuario.model';
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
  };
  nuevoOperadorClave: string = '';

  //Historial de ASISTENCIA
  tabActual: 'directorio' | 'historial' = 'directorio';
  historial: Asistencia[] = [];
  fechaInicioFiltro: string= '';
  fechaFinFiltro:string = '';
  //Paginacion del historial: el backend nunca manda todo el rando de fechas de una sola vez
  paginaHistorial: number = 1;
  totalPaginasHistorial: number = 1;
  totalHistorial: number = 0;

  constructor(
    private asistenciaService: AsistenciaService,
    private usuarioService: UsuarioService,
    private cdr: ChangeDetectorRef,
    private notificacionService: NotificacionService
  ){};

  ngOnInit(): void {
    this.cargarOperadores();
    this.cargarSupervisores();
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
    return { nombre_completo: '', codigo_megued: '', cedula: '', telefono: '', direccion: '', supervisor_id: null, usuario: '' };
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
      30
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
