import { Component, OnInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuarioService } from '../../../../core/services/usuario.service';
import { HaciendaService } from '../../../../core/services/hacienda.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NuevoUsuario, Usuario } from '../../../../core/models/usuario.model';
import { Hacienda } from '../../../../core/models/hacienda.model';
import { CargoUsuario } from '../../../../core/models/auth.model';

// SUPERVISOR y ESCANER necesitan una hacienda fija desde su creacion (ver CLAUDE.md) - ADMIN/ASISTENTE no.
const CARGOS_CON_HACIENDA: CargoUsuario[] = ['SUPERVISOR', 'ESCANER'];

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-admin-panel',
  styleUrl: './admin-panel.css',
  templateUrl: './admin-panel.html',
})
export class AdminPanel implements OnInit {
  private usuarioService = inject(UsuarioService);
  private haciendaService = inject(HaciendaService);
  private notificacionService = inject(NotificacionService);
  private confirmacionService = inject(ConfirmacionService);
  private cdr = inject(ChangeDetectorRef);
  protected authService = inject(AuthService);

  // La pestaña Haciendas (Token, crear hacienda) es exclusiva de ADMIN - un Asistente entra a esta misma
  // pagina (para Usuarios) pero no la ve, ver admin-panel.html.
  get esAdmin(): boolean {
    return this.authService.tieneRol('ADMIN');
  }

  tabActual: 'usuarios' | 'haciendas' = 'usuarios';
  cargosDisponibles: CargoUsuario[] = ['ADMIN', 'ASISTENTE', 'SUPERVISOR', 'ESCANER'];

  usuarios: Usuario[] = [];
  haciendas: Hacienda[] = [];

  // Modal: Nuevo Usuario
  mostrarModalUsuario = false;
  mostrarClaveNuevo = signal(false);
  nuevoUsuario: NuevoUsuario = this.usuarioVacio();
  get cargoNecesitaHacienda(): boolean {
    return CARGOS_CON_HACIENDA.includes(this.nuevoUsuario.cargo);
  }

  // Modal: Resetear clave (sirve para Usuario de oficina)
  mostrarModalClave = false;
  mostrarClaveReset = signal(false);
  usuarioParaResetear: Usuario | null = null;
  claveNueva = '';

  // Modal: Nueva Hacienda
  mostrarModalHacienda = false;
  nombreHaciendaNueva = '';

  ngOnInit(): void {
    this.cargarUsuarios();
    this.cargarHaciendas();
  }

  cambiarTab(tab: 'usuarios' | 'haciendas'): void {
    this.tabActual = tab;
  }

  cargarUsuarios(): void {
    this.usuarioService.obtenerUsuarios().subscribe({
      next: (data) => {
        this.usuarios = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando usuarios:', err),
    });
  }

  cargarHaciendas(): void {
    this.haciendaService.obtenerHaciendas().subscribe({
      next: (data) => {
        this.haciendas = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando haciendas:', err),
    });
  }

  // --- Nuevo Usuario ---
  abrirModalUsuario(): void {
    this.nuevoUsuario = this.usuarioVacio();
    this.mostrarClaveNuevo.set(false);
    this.mostrarModalUsuario = true;
  }

  cerrarModalUsuario(): void {
    this.mostrarModalUsuario = false;
  }

  guardarNuevoUsuario(): void {
    const datos: NuevoUsuario = { ...this.nuevoUsuario };
    if (!this.cargoNecesitaHacienda) {
      delete datos.hacienda_id;
    }

    this.usuarioService.crearUsuario(datos).subscribe({
      next: () => {
        this.notificacionService.exito(`Usuario "${datos.usuario}" creado correctamente.`);
        this.cargarUsuarios();
        this.cerrarModalUsuario();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al crear el usuario.');
        this.cdr.detectChanges();
      },
    });
  }

  private usuarioVacio(): NuevoUsuario {
    return { nombre_completo: '', usuario: '', clave: '', cargo: 'ASISTENTE', hacienda_id: null };
  }

  // --- Resetear clave de Usuario ---
  abrirModalClave(usuario: Usuario): void {
    this.usuarioParaResetear = usuario;
    this.claveNueva = '';
    this.mostrarClaveReset.set(false);
    this.mostrarModalClave = true;
  }

  cerrarModalClave(): void {
    this.mostrarModalClave = false;
    this.usuarioParaResetear = null;
  }

  guardarClaveNueva(): void {
    if (!this.usuarioParaResetear || this.claveNueva.length < 6) return;

    this.usuarioService.resetearClave(this.usuarioParaResetear.id, this.claveNueva).subscribe({
      next: () => {
        this.notificacionService.exito('Clave actualizada correctamente.');
        this.cerrarModalClave();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al resetear la clave.');
        this.cdr.detectChanges();
      },
    });
  }

  // --- Token de Hacienda ---
  generarToken(hacienda: Hacienda): void {
    this.haciendaService.generarToken(hacienda.id).subscribe({
      next: (res) => {
        hacienda.token_actual = res.token_actual;
        hacienda.token_expira_en = res.token_expira_en;
        this.notificacionService.exito(`Token generado para ${hacienda.nombre}. Vigente 24h.`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al generar el token.');
        this.cdr.detectChanges();
      },
    });
  }

  async invalidarToken(hacienda: Hacienda): Promise<void> {
    const confirmado = await this.confirmacionService.preguntar(
      `¿Invalidar el token actual de ${hacienda.nombre}? Los puntos de control que lo usen dejarán de poder marcar hasta que generes uno nuevo.`,
      'Invalidar token'
    );
    if (!confirmado) return;

    this.haciendaService.invalidarToken(hacienda.id).subscribe({
      next: () => {
        hacienda.token_actual = null;
        hacienda.token_expira_en = null;
        this.notificacionService.exito(`Token de ${hacienda.nombre} invalidado.`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al invalidar el token.');
        this.cdr.detectChanges();
      },
    });
  }

  // --- Nueva Hacienda ---
  abrirModalHacienda(): void {
    this.nombreHaciendaNueva = '';
    this.mostrarModalHacienda = true;
  }

  cerrarModalHacienda(): void {
    this.mostrarModalHacienda = false;
  }

  guardarNuevaHacienda(): void {
    if (!this.nombreHaciendaNueva.trim()) return;

    this.haciendaService.crearHacienda(this.nombreHaciendaNueva.trim()).subscribe({
      next: () => {
        this.notificacionService.exito(`Hacienda "${this.nombreHaciendaNueva.trim()}" creada correctamente.`);
        this.cargarHaciendas();
        this.cerrarModalHacienda();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notificacionService.error(err.error?.message || 'Error al crear la hacienda.');
        this.cdr.detectChanges();
      },
    });
  }
}
