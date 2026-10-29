import { Component, OnInit, ViewChild, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { RegistroActividadService } from '../../../../core/services/registro-actividad.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { Asistencia } from '../../../../core/models/asistencia.model';
import { timeoutDeLista, mensajeErrorCarga } from '../../../../core/utils/peticion-lista.util';
import { FilaHistorialAsistencia } from '../../components/fila-historial-asistencia/fila-historial-asistencia';
import { HojaActividadesModal, resolverHaciendaJornada } from '../../components/hoja-actividades-modal/hoja-actividades-modal';

/*
"Mi Perfil" del trabajador (pedido del usuario, 2026-10-28, rediseñado 2026-10-29 como tarjeta mobile-first -
el único dispositivo que usan MECANICO/OPERADOR es el celular): el propio trabajador ve su QR de carnet, sus
datos (teléfono/dirección editables, cédula de solo lectura), cambia su usuario y su clave, y revisa su
historial de asistencia en un modal. Reutiliza los mismos componentes/patrones que ya usa el Panel de
Asistente para el modal "Historial de Asistencia" de un operador puntual (FilaHistorialAsistencia,
HojaActividadesModal) - no se duplica esa lógica acá.
*/
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FilaHistorialAsistencia, HojaActividadesModal],
  selector: 'app-mi-perfil',
  styleUrl: './mi-perfil.css',
  templateUrl: './mi-perfil.html',
})
export class MiPerfil implements OnInit {
  @ViewChild('hojaModal') hojaModal!: HojaActividadesModal;

  // --- QR del carnet (mismo payload que generarQR en asistencia-panel.ts: {operador_id}, 100% cliente) ---
  qrCodeUrl = '';

  // --- Datos (teléfono/dirección editables juntos, cédula de solo lectura - mismo patrón inline que
  // Usuario/Ficha del Panel de Asistente) ---
  editandoDatos = signal(false);
  nuevoTelefono = '';
  nuevaDireccion = '';
  guardandoDatos = false;

  // --- Usuario (editable, mismo patrón inline que la Ficha del Panel de Asistente) ---
  editandoUsuario = signal(false);
  nuevoUsuario = '';
  guardandoUsuario = false;

  // --- Clave (autoservicio, pedido del usuario, 2026-10-29: pone una nueva sin pedir la actual) ---
  editandoClave = signal(false);
  nuevaClave = '';
  repetirClave = '';
  guardandoClave = false;

  // --- Historial (dentro de un modal, pedido del usuario, 2026-10-29 - antes vivía siempre visible en la
  // página) ---
  mostrarHistorial = signal(false);
  historial: Asistencia[] = [];
  fechaInicioFiltro = '';
  fechaFinFiltro = '';
  paginaHistorial = 1;
  totalPaginasHistorial = 1;
  totalHistorial = 0;
  cargandoHistorial = false;
  cargandoReporteImpresion = false;

  constructor(
    private asistenciaService: AsistenciaService,
    private registroActividadService: RegistroActividadService,
    protected authService: AuthService,
    private notificacionService: NotificacionService,
    private confirmacionService: ConfirmacionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.generarQr();
    // Se carga de una, no solo al abrir el modal - "siempre actualizado" (pedido original del usuario,
    // 2026-10-28), sin que el trabajador vea un parpadeo de carga al tocar "Ver historial".
    this.buscarHistorial();
  }

  private async generarQr(): Promise<void> {
    const operadorId = this.authService.perfil()?.id;
    if (!operadorId) return;
    try {
      this.qrCodeUrl = await QRCode.toDataURL(JSON.stringify({ operador_id: operadorId }), { width: 220, margin: 2 });
      this.cdr.detectChanges();
    } catch (err) {
      // Mismo criterio que generarQR en asistencia-panel.ts: si falla (navegador sin soporte de canvas),
      // no es grave - el trabajador simplemente no ve el QR, el resto de Mi Perfil sigue funcionando.
      console.error('Error generando el QR del carnet:', err);
    }
  }

  // --- Datos (teléfono/dirección) ---
  abrirEdicionDatos(): void {
    const perfil = this.authService.perfil();
    this.nuevoTelefono = perfil?.telefono || '';
    this.nuevaDireccion = perfil?.direccion || '';
    this.editandoDatos.set(true);
    this.cdr.detectChanges();
  }

  cancelarEdicionDatos(): void {
    this.editandoDatos.set(false);
    this.cdr.detectChanges();
  }

  guardarDatos(): void {
    if (this.guardandoDatos) return;
    const operadorId = this.authService.perfil()?.id;
    if (!operadorId) return;

    this.guardandoDatos = true;
    this.asistenciaService.actualizarOperador(operadorId, {
      telefono: this.nuevoTelefono.trim(),
      direccion: this.nuevaDireccion.trim(),
    }).subscribe({
      next: () => {
        this.guardandoDatos = false;
        this.notificacionService.exito('Tus datos fueron actualizados.');
        this.authService.actualizarPerfilLocal({ telefono: this.nuevoTelefono.trim(), direccion: this.nuevaDireccion.trim() });
        this.editandoDatos.set(false);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardandoDatos = false;
        this.notificacionService.error(err.error?.message || 'Error al actualizar tus datos.');
        this.cdr.detectChanges();
      },
    });
  }

  // --- Usuario ---
  abrirEdicionUsuario(): void {
    this.nuevoUsuario = this.authService.perfil()?.usuario || '';
    this.editandoUsuario.set(true);
    this.cdr.detectChanges();
  }

  cancelarEdicionUsuario(): void {
    this.editandoUsuario.set(false);
    this.nuevoUsuario = '';
    this.cdr.detectChanges();
  }

  async guardarUsuario(): Promise<void> {
    const usuario = this.nuevoUsuario.trim();
    if (!usuario || this.guardandoUsuario) return;
    if (usuario === this.authService.perfil()?.usuario) {
      this.cancelarEdicionUsuario();
      return;
    }

    const confirmado = await this.confirmacionService.preguntar(
      'Al cambiar tu usuario se cerrará tu sesión y deberás volver a iniciar sesión con el usuario nuevo. ¿Confirmas?',
      'Cambiar usuario'
    );
    if (!confirmado) return;

    this.guardandoUsuario = true;
    this.asistenciaService.cambiarMiUsuario(usuario).subscribe({
      next: (res) => {
        this.guardandoUsuario = false;
        this.notificacionService.exito(res.message || 'Usuario actualizado.');
        // El backend ya invalido la sesion actual (sesion_valida_desde) - cerrar sesion aca es obligatorio,
        // no opcional, para que el trabajador vuelva a entrar con el usuario nuevo.
        this.authService.logout();
      },
      error: (err) => {
        this.guardandoUsuario = false;
        this.notificacionService.error(err.error?.message || 'Error al cambiar tu usuario.');
        this.cdr.detectChanges();
      },
    });
  }

  // --- Clave ---
  abrirEdicionClave(): void {
    this.nuevaClave = '';
    this.repetirClave = '';
    this.editandoClave.set(true);
    this.cdr.detectChanges();
  }

  cancelarEdicionClave(): void {
    this.editandoClave.set(false);
    this.nuevaClave = '';
    this.repetirClave = '';
    this.cdr.detectChanges();
  }

  async guardarClave(): Promise<void> {
    if (this.guardandoClave) return;
    const clave = this.nuevaClave.trim();
    if (clave.length < 8) {
      this.notificacionService.error('La clave debe tener al menos 8 caracteres.');
      return;
    }
    if (clave !== this.repetirClave.trim()) {
      this.notificacionService.error('Las claves no coinciden.');
      return;
    }

    const confirmado = await this.confirmacionService.preguntar(
      'Al cambiar tu clave se cerrará tu sesión y deberás volver a iniciar sesión con la clave nueva. ¿Confirmas?',
      'Cambiar clave'
    );
    if (!confirmado) return;

    this.guardandoClave = true;
    this.asistenciaService.cambiarMiClave(clave).subscribe({
      next: (res) => {
        this.guardandoClave = false;
        this.notificacionService.exito(res.message || 'Clave actualizada.');
        this.authService.logout();
      },
      error: (err) => {
        this.guardandoClave = false;
        this.notificacionService.error(err.error?.message || 'Error al cambiar tu clave.');
        this.cdr.detectChanges();
      },
    });
  }

  // --- Historial (modal) ---
  abrirHistorial(): void {
    this.mostrarHistorial.set(true);
    this.cdr.detectChanges();
  }

  cerrarHistorial(): void {
    this.mostrarHistorial.set(false);
    this.cdr.detectChanges();
  }

  buscarHistorial(): void {
    this.paginaHistorial = 1;
    this.cargarPaginaHistorial();
  }

  cambiarPaginaHistorial(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasHistorial) {
      this.paginaHistorial = nuevaPagina;
      this.cargarPaginaHistorial();
    }
  }

  private cargarPaginaHistorial(): void {
    this.cargandoHistorial = true;
    this.asistenciaService.obtenerMiHistorial(
      this.fechaInicioFiltro || undefined,
      this.fechaFinFiltro || undefined,
      this.paginaHistorial,
      10,
    ).pipe(timeoutDeLista()).subscribe({
      next: (res) => {
        this.cargandoHistorial = false;
        this.historial = res.data || [];
        this.totalPaginasHistorial = res.totalPaginas || 1;
        this.totalHistorial = res.total || 0;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoHistorial = false;
        this.notificacionService.error(mensajeErrorCarga(err, 'Error al cargar tu historial de asistencia.'));
        this.cdr.detectChanges();
      },
    });
  }

  // --- Ver/Imprimir hoja de actividades (mismo patron que asistencia-panel.ts/supervisor-panel.ts) ---
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
        this.hojaModal.abrir([{
          operador: reg.operador!,
          registros,
          haciendaNombre: resolverHaciendaJornada(reg.operador!, reg),
          fecha: reg.fecha,
          observacionesSupervisor: reg.observaciones ?? null,
        }], { autoImprimir });
      },
      error: (err) => {
        this.cargandoReporteImpresion = false;
        this.notificacionService.error(err.error?.message || 'Error al cargar las labores de ese día.');
        this.cdr.detectChanges();
      },
    });
  }
}
