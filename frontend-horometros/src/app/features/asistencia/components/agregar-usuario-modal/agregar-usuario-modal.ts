import { Component, ChangeDetectorRef, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { Asistencia, Operador } from '../../../../core/models/asistencia.model';

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
  // usan otros modales de la pantalla en vez de que este componente conozca al padre. Emite la Asistencia
  // recién creada (no solo un "listo" vacío, pedido del usuario 2026-10-27): cuando este modal lo abrió el
  // flujo de "marcar ausente" sobre un trabajador del roster completo, el padre necesita ese id para abrir a
  // continuación el PanelLaboresModal sobre ESA asistencia puntual.
  @Output() agregado = new EventEmitter<Asistencia>();

  visible = false;
  busqueda = '';
  resultados: Operador[] = [];
  buscando = false;
  operadorSeleccionado: Operador | null = null;
  guardando = false;

  paginaActual = 1;
  totalPaginas = 1;
  totalResultados = 0;

  /*
  Fecha pasada + hora manual (pedido del usuario, 2026-10-27): "+ Agregar Usuario" ya no está limitado a hoy -
  el Supervisor puede agregar a alguien que faltó marcar un día ANTERIOR, mientras esa hacienda no haya
  cerrado ya esa jornada. Para hoy, la hora de ingreso sigue siendo "ahora mismo" (como antes, sin pedir nada
  extra) - para un día pasado, o cuando este modal lo abre directamente el flujo de "marcar ausente" sobre un
  trabajador del roster completo que nunca marcó (operadorFijo, ver supervisor-panel.ts), no hay una hora real
  que inferir: el Supervisor la escribe a mano, nunca se inventa.
  */
  fecha = '';
  esHoy = true;
  horaIngresoHH: number | null = null;
  horaIngresoMM: number | null = null;
  // Cuando el modal lo abre el flujo de "marcar ausente" sobre UN trabajador puntual del roster completo
  // (ver supervisor-panel.ts), ya se sabe a quién se agrega - se salta el buscador por completo.
  operadorFijo: Operador | null = null;

  get requiereHoraManual(): boolean {
    return !this.esHoy || !!this.operadorFijo;
  }

  get fechaFormateada(): string {
    const [anio, mes, dia] = this.fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }

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

  private hoyEcuador(): string {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guayaquil' });
  }

  abrir(opciones?: { supervisorId?: number | null; fecha?: string; operadorFijo?: Operador }): void {
    this.visible = true;
    this.supervisorId = opciones?.supervisorId ?? null;
    this.fecha = opciones?.fecha || this.hoyEcuador();
    this.esHoy = this.fecha === this.hoyEcuador();
    this.horaIngresoHH = null;
    this.horaIngresoMM = null;
    this.operadorFijo = opciones?.operadorFijo ?? null;
    this.busqueda = '';
    this.resultados = [];
    this.operadorSeleccionado = this.operadorFijo;
    this.paginaActual = 1;
    this.totalPaginas = 1;
    this.totalResultados = 0;
    this.cdr.detectChanges();
    // Carga inicial (pedido del usuario): la lista sale de una vez, sin tener que escribir nada primero -
    // salvo que ya se sepa a quién se agrega (operadorFijo), ahí no hace falta buscar nada.
    if (!this.operadorFijo) this.buscar('', 1);
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

  // Combina HH/MM con `this.fecha` (no "hoy", a diferencia de mi-jornada.ts) usando setHours en hora LOCAL del
  // navegador - mismo criterio que horaComponentesAIso en mi-jornada.ts, solo que aquí la fecha base es la
  // seleccionada, no necesariamente la de hoy.
  private horaIngresoAIso(): string | undefined {
    if (this.horaIngresoHH === null || this.horaIngresoMM === null) return undefined;
    const horas = Math.min(23, Math.max(0, Math.trunc(this.horaIngresoHH)));
    const minutos = Math.min(59, Math.max(0, Math.trunc(this.horaIngresoMM)));
    const fecha = new Date(`${this.fecha}T00:00:00`);
    fecha.setHours(horas, minutos, 0, 0);
    return fecha.toISOString();
  }

  confirmarAgregar(): void {
    if (!this.operadorSeleccionado) return;
    if (this.requiereHoraManual && (this.horaIngresoHH === null || this.horaIngresoMM === null)) return;
    this.guardando = true;
    const fechaParaEnviar = this.esHoy ? undefined : this.fecha;
    this.asistenciaService.agregarAsistenciaManual(this.operadorSeleccionado.id, fechaParaEnviar, this.horaIngresoAIso()).subscribe({
      next: (res) => {
        const destino = this.esHoy ? 'la lista de hoy' : `la lista del ${this.fechaFormateada}`;
        this.notificacionService.exito(`${this.operadorSeleccionado?.nombre_completo} agregado a ${destino}.`);
        this.guardando = false;
        this.agregado.emit(res.asistencia);
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
