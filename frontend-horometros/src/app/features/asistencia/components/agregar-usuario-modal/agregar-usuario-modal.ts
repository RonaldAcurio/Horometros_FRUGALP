import { Component, ChangeDetectorRef, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { Operador } from '../../../../core/models/asistencia.model';

/*
Botón "+ Agregar Usuario", junto a "Registro de Asistencia de Hoy" en el Panel de Supervisor (pedido del
usuario, 2026-10-20): mete a la lista de hoy a un trabajador que no llegó a marcar por cualquier motivo. Solo
pide A QUIÉN agregar - el backend crea la Asistencia igual que una entrada normal (EN_JORNADA), así que de ahí
en adelante se gestiona como cualquier otra fila (equipo/actividad se agregan después, con el botón ➕ de su
fila, ver PanelLaboresModal).
*/
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-agregar-usuario-modal',
  styleUrl: './agregar-usuario-modal.css',
  templateUrl: './agregar-usuario-modal.html',
})
export class AgregarUsuarioModal {
  // El padre (supervisor-panel.ts) refresca su tabla cuando esto se emite - mismo patrón de comunicación que
  // usan otros modales de la pantalla en vez de que este componente conozca al padre.
  @Output() agregado = new EventEmitter<void>();

  visible = false;
  busqueda = '';
  resultados: Operador[] = [];
  buscando = false;
  operadorSeleccionado: Operador | null = null;
  guardando = false;
  private debounceBusqueda?: ReturnType<typeof setTimeout>;

  constructor(
    private asistenciaService: AsistenciaService,
    private notificacionService: NotificacionService,
    private cdr: ChangeDetectorRef,
  ) {}

  abrir(): void {
    this.visible = true;
    this.busqueda = '';
    this.resultados = [];
    this.operadorSeleccionado = null;
    this.cdr.detectChanges();
  }

  cerrar(): void {
    this.visible = false;
    if (this.debounceBusqueda) clearTimeout(this.debounceBusqueda);
    this.cdr.detectChanges();
  }

  // El buscador reutiliza el mismo endpoint paginado del Directorio de Operadores (ver
  // AsistenciaService.obtenerOperadoresPaginado) - el backend ya lo acota a los propios trabajadores cuando
  // quien llama es SUPERVISOR (ADMIN sigue viendo a todos).
  onBuscarChange(): void {
    this.operadorSeleccionado = null;
    if (this.debounceBusqueda) clearTimeout(this.debounceBusqueda);
    const texto = this.busqueda.trim();
    if (!texto) {
      this.resultados = [];
      return;
    }
    this.debounceBusqueda = setTimeout(() => this.buscar(texto), 300);
  }

  private buscar(texto: string): void {
    this.buscando = true;
    this.asistenciaService.obtenerOperadoresPaginado(1, 20, texto).subscribe({
      next: (res) => {
        this.buscando = false;
        this.resultados = res.data || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.buscando = false;
        this.notificacionService.error('No se pudo buscar trabajadores.');
        this.cdr.detectChanges();
      },
    });
  }

  seleccionarOperador(op: Operador): void {
    this.operadorSeleccionado = op;
    this.resultados = [];
    this.busqueda = op.nombre_completo;
    this.cdr.detectChanges();
  }

  confirmarAgregar(): void {
    if (!this.operadorSeleccionado) return;
    this.guardando = true;
    this.asistenciaService.agregarAsistenciaManual(this.operadorSeleccionado.id).subscribe({
      next: () => {
        this.notificacionService.exito(`${this.operadorSeleccionado?.nombre_completo} agregado a la lista de hoy.`);
        this.guardando = false;
        this.agregado.emit();
        this.cerrar();
      },
      error: (err) => {
        this.guardando = false;
        this.notificacionService.error(err.error?.message || 'No se pudo agregar al trabajador.');
        this.cdr.detectChanges();
      },
    });
  }
}
