import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Operador, Asistencia } from '../../../../core/models/asistencia.model';
import * as QRCode from 'qrcode';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { VisorFoto } from '../../components/visor-foto/visor-foto';

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

  // Modal Nuevo Operador
  mostrarModalOperador: boolean = false;
  nuevoOperador: Partial<Operador> = {
    nombre_completo: '',
    codigo_megued: '',
    cedula: '',
    telefono: '',
    direccion: ''
  };

  //Historial de ASISTENCIA
  tabActual: 'directorio' | 'historial' = 'directorio';
  historial: Asistencia[] = [];
  fechaInicioFiltro: string= '';
  fechaFinFiltro:string = '';

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef
  ){};

  ngOnInit(): void {
    this.cargarOperadores();
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

  buscarHistorial():void{
    this.asistenciaService.obtenerHistorial(this.fechaInicioFiltro || undefined, this.fechaFinFiltro || undefined).subscribe({
      next:(data:any) => {
        this.historial = Array.isArray(data) ? data : data?.data || [];
        this.cdr.detectChanges();
      },
      error:(err) => console.error('Error cargando historial:', err)
    });
  }
  
}
