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
  
  // Búsqueda y Paginación
  terminoBusqueda: string = '';
  paginaActual: number = 1;
  itemsPorPagina: number = 5;

  // Operador Seleccionado para Formulario / QR
  operadorSeleccionado: Operador | null = null;
  qrCodeUrl: string = '';
  
  // Escáner QR
  escanearActivo: boolean = false;
  mensajeEscaneo: string = '';
  tipoMensaje: 'exito' | 'error' | 'info' = 'info';

  // Formulario rápido (edición)
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
  }

  cargarOperadores(): void {
    this.asistenciaService.obtenerOperadores().subscribe({
      next: (data: any) => {
        console.log('--- RESPUESTA RECIBIDA DEL BACKEND ---', data);

        if (Array.isArray(data)) {
          this.operadores = data;
        } else if (data && typeof data === 'object') {
          this.operadores = data.data || data.operadores || [];
        } else {
          this.operadores = [];
        }

        console.log('--- OPERADORES CARGADOS EN MEMORIA ---', this.operadores.length);

        this.paginaActual = 1;
        this.cdr.detectChanges(); // Forzar renderizado en pantalla
      },
      error: (err) => console.error('Error cargando operadores desde Render:', err)
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

  // --- FILTRADO Y PAGINACIÓN EN TIEMPO REAL ---
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
    const fin = inicio + this.itemsPorPagina;
    return filtrados.slice(inicio, fin);
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

  // --- SELECCIÓN Y EDICIÓN ---
  async seleccionarOperador(op: Operador): Promise<void> {
    this.operadorSeleccionado = op;
    this.cedula = op.cedula || '';
    this.telefono = op.telefono || '';
    this.direccion = op.direccion || '';

    // Esperamos que el QR termine de generarse
    await this.generarQR(op.id);

    // Forzamos la actualización de la vista de inmediato
    this.cdr.detectChanges();
  }

  async generarQR(operadorId: number): Promise<void> {
    try {
      const payload = JSON.stringify({ operador_id: operadorId });
      this.qrCodeUrl = await QRCode.toDataURL(payload, { width: 250, margin: 2 });
    } catch (err) {
      console.error('Error al generar código QR:', err);
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

  // --- MODAL NUEVO OPERADOR ---
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
        alert('Error al guardar en el servidor.');
      }
    });
  }

  // --- ESCÁNER ---
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

  procesarMarca(operadorId: number): void {
    this.asistenciaService.registrarMarcaQR(operadorId).subscribe({
      next: (res) => {
        this.mensajeEscaneo = res.message;
        this.tipoMensaje = 'exito';
        this.cargarAsistenciasHoy();
      },
      error: (err) => {
        this.mensajeEscaneo = err.error?.message || 'Error procesando la asistencia.';
        this.tipoMensaje = 'error';
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
}