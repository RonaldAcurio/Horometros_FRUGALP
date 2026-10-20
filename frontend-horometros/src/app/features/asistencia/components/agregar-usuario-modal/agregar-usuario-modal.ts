import { Component, ChangeDetectorRef, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { Operador } from '../../../../core/models/asistencia.model';

const LIMITE_RESULTADOS = 10;

/*
Botón "+ Agregar Usuario", junto a "Registro de Asistencia de Hoy" en el Panel de Supervisor (pedido del
usuario, 2026-10-20): mete a la lista de hoy a un trabajador que no llegó a marcar por cualquier motivo. Solo
pide A QUIÉN agregar - el backend crea la Asistencia igual que una entrada normal (EN_JORNADA), así que de ahí
en adelante se gestiona como cualquier otra fila (equipo/actividad se agregan después, con el botón ➕ de su
fila, ver PanelLaboresModal).

Ajuste (pedido del usuario, 2026-10-20, tras probar en producción): el buscador arranca mostrando una lista
(sin tener que escribir nada), con límite de 10 resultados por página y paginación - antes solo buscaba cuando
se escribía algo, y traía hasta 20 de golpe sin forma de ver más.
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

  paginaActual = 1;
  totalPaginas = 1;
  totalResultados = 0;

  // Solo tiene valor cuando quien abre el modal es ADMIN y ya eligió un Supervisor puntual arriba (ver
  // supervisor-panel.ts, abrirAgregarUsuario) - un SUPERVISOR real no lo necesita, el backend ya lo acota
  // solo a sus propios trabajadores (ver obtenerOperadores).
  private supervisorId: number | null = null;

  private debounceBusqueda?: ReturnType<typeof setTimeout>;

  constructor(
    private asistenciaService: AsistenciaService,
    private notificacionService: NotificacionService,
    private cdr: ChangeDetectorRef,
  ) {}

  abrir(supervisorId?: number | null): void {
    this.visible = true;
    this.supervisorId = supervisorId ?? null;
    this.busqueda = '';
    this.resultados = [];
    this.operadorSeleccionado = null;
    this.paginaActual = 1;
    this.totalPaginas = 1;
    this.totalResultados = 0;
    this.cdr.detectChanges();
    // Carga inicial (pedido del usuario): la lista sale de una vez, sin tener que escribir nada primero.
    this.buscar('', 1);
  }

  cerrar(): void {
    this.visible = false;
    if (this.debounceBusqueda) clearTimeout(this.debounceBusqueda);
    this.cdr.detectChanges();
  }

  // Búsqueda en tiempo real (pedido del usuario): a medida que se escribe, sin botón "buscar" aparte - con
  // debounce de 300ms para no pegarle una petición al backend por cada tecla (mismo criterio que
  // onSearchChange en asistencia-panel.ts, Directorio de Operadores). Cambiar el texto siempre vuelve a la
  // página 1.
  onBuscarChange(): void {
    this.operadorSeleccionado = null;
    if (this.debounceBusqueda) clearTimeout(this.debounceBusqueda);
    const texto = this.busqueda.trim();
    this.debounceBusqueda = setTimeout(() => this.buscar(texto, 1), 300);
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina < 1 || nuevaPagina > this.totalPaginas || this.buscando) return;
    this.buscar(this.busqueda.trim(), nuevaPagina);
  }

  private buscar(texto: string, pagina: number): void {
    this.buscando = true;
    this.asistenciaService.obtenerOperadoresPaginado(pagina, LIMITE_RESULTADOS, texto || undefined, this.supervisorId ?? undefined).subscribe({
      next: (res) => {
        this.buscando = false;
        this.resultados = res.data || [];
        this.paginaActual = res.pagina || pagina;
        this.totalPaginas = res.totalPaginas || 1;
        this.totalResultados = res.total || 0;
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
