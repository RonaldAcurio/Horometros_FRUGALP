import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { AsistenciaService, Operador, Asistencia } from '../../services/asistencia';
import * as QRCode from 'qrcode';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ZXingScannerModule
  ],
  selector: 'app-asistencia',
  styleUrl: './asistencia.css',
  templateUrl: './asistencia.html',
})
export class AsistenciaComponent implements OnInit {
  operadores: Operador[] = [];
  asistenciasHoy: Asistencia[] = [];
  actividades: any[] = [];
  
  // Búsqueda y Paginación
  terminoBusqueda: string = '';
  paginaActual: number = 1;
  itemsPorPagina: number = 5;

  // Operador Seleccionado
  operadorSeleccionado: Operador | null = null;
  qrCodeUrl: string = '';
  
  // Escáner QR y Marcación
  escanearActivo: boolean = false;
  mensajeEscaneo: string = '';
  tipoMensaje: 'exito' | 'error' | 'info' = 'info';

  // Modal Selección de Actividad para Marcación de Salida
  mostrarModalActividad: boolean = false;
  operadorPendienteSalidaId: number | null = null;
  actividadSeleccionadaId: number | null = null;

  // Formulario de edición rápida
  cedula: string = '';
  telefono: string = '';
  direccion: string = '';

  // Modal Nuevo Operador
  mostrarModalOperador: boolean = false;
  nuevoOperador: Partial<Operador> = {
    nombre_completo: '',
    codigo_megued: '',
    cedula: '',
    telefono: '',
    direccion: ''
  };

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarOperadores();
    this.cargarAsistenciasHoy();
    this.cargarActividades();
  }

  cargarOperadores(): void {
    this.asistenciaService.obtenerOperadores().subscribe({
      next: (data: any) => {
        if (Array.isArray(data)) {
          this.operadores = data;
        } else if (data && typeof data === 'object') {
          this.operadores = data.data || data.operadores || [];
        } else {
          this.operadores = [];
        }
        this.paginaActual = 1;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando operadores:', err)
    });
  }

  cargarAsistenciasHoy(): void {
    this.asistenciaService.obtenerAsistenciasHoy().subscribe({
      next: (data) => {
        this.asistenciasHoy = Array.isArray(data) ? data : (data as any)?.data || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando asistencias:', err)
    });
  }

  cargarActividades(): void {
    this.asistenciaService.obtenerActividades().subscribe({
      next: (data) => {
        this.actividades = Array.isArray(data) ? data : (data as any)?.data || [];
      },
      error: (err) => console.error('Error cargando catálogo de actividades:', err)
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

    const datos = {
      cedula: this.cedula,
      telefono: this.telefono,
      direccion: this.direccion
    };

    this.asistenciaService.actualizarOperador(this.operadorSeleccionado.id, datos).subscribe({
      next: () => {
        alert('¡Datos del operador actualizados exitosamente!');
        this.cargarOperadores();
      },
      error: () => alert('Error al actualizar los datos')
    });
  }

  // MODAL NUEVO OPERADOR
  abrirModalNuevoOperador(): void {
    this.nuevoOperador = { nombre_completo: '', codigo_megued: '', cedula: '', telefono: '', direccion: '' };
    this.mostrarModalOperador = true;
  }

  cerrarModalNuevoOperador(): void {
    this.mostrarModalOperador = false;
    this.nuevoOperador = { nombre_completo: '', codigo_megued: '', cedula: '', telefono: '', direccion: '' };
  }

  guardarNuevoOperador(): void {
    if (!this.nuevoOperador.nombre_completo || !this.nuevoOperador.codigo_megued) return;

    this.asistenciaService.crearOperador(this.nuevoOperador).subscribe({
      next: () => {
        alert('¡Operador creado con éxito!');
        this.cargarOperadores();
        this.cerrarModalNuevoOperador();
      },
      error: (err) => {
        console.error('Error al crear operador:', err);
        alert('Error al guardar operador.');
      }
    });
  }

  // ESCÁNER Y MARCACIÓN
  onCodeResult(resultString: string): void {
    try {
      const data = JSON.parse(resultString);
      if (data && data.operador_id) {
        this.escanearActivo = false;
        this.procesarMarca(data.operador_id);
      }
    } catch (e) {
      this.mensajeEscaneo = 'Código QR no válido para el sistema.';
      this.tipoMensaje = 'error';
    }
  }

  procesarMarca(operadorId: number, actividadId?: number): void {
    this.asistenciaService.registrarMarcaQR(operadorId, actividadId).subscribe({
      next: (res) => {
        if (res.requiere_actividad) {
          this.operadorPendienteSalidaId = operadorId;
          this.mostrarModalActividad = true;
          this.cdr.detectChanges();
          return;
        }

        this.mensajeEscaneo = res.message || 'Marcación registrada con éxito.';
        this.tipoMensaje = 'exito';
        this.cerrarModalActividad();
        this.cargarAsistenciasHoy();
      },
      error: (err) => {
        this.mensajeEscaneo = err.error?.message || 'Error al procesar asistencia.';
        this.tipoMensaje = 'error';
      }
    });
  }

  confirmarSalidaConActividad(): void {
    if (this.operadorPendienteSalidaId && this.actividadSeleccionadaId) {
      this.procesarMarca(this.operadorPendienteSalidaId, this.actividadSeleccionadaId);
    }
  }

  cerrarModalActividad(): void {
    this.mostrarModalActividad = false;
    this.operadorPendienteSalidaId = null;
    this.actividadSeleccionadaId = null;
  }

  // ACCIÓN CERRAR JORNADA
  ejecutarCierreDiario(): void {
    if (confirm('¿Desea realizar el cierre diario? Los registros sin salida quedarán en revisión.')) {
      this.asistenciaService.finalizarDia().subscribe({
        next: (res) => {
          alert(res.message || 'Cierre de jornada completado.');
          this.cargarAsistenciasHoy();
        },
        error: () => alert('Error procesando el cierre de día.')
      });
    }
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
}