import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { ModalActividad } from '../../components/modal-actividad/modal-actividad';

@Component({
  standalone: true,
  imports: [CommonModule, ZXingScannerModule, ModalActividad],
  selector: 'app-marcacion-kiosco',
  styleUrl: './marcacion-kiosco.css',
  templateUrl: './marcacion-kiosco.html',
})
export class MarcacionKiosco {
  escanearActivo: boolean = true;
  mensajeEscaneo: string = '';
  tipoMensaje: 'exito' | 'error' | 'info' = 'info';

  mostrarModalActividad: boolean = false;
  operadorPendienteSalidaId: number | null = null;

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef
  ) {}

  onCodeResult(resultString: string): void {
    try {
      const data = JSON.parse(resultString);
      if (data && data.operador_id) {
        this.escanearActivo = false;
        this.procesarMarca(data.operador_id);
      }
    } catch (e) {
      this.mensajeEscaneo = 'Código QR no válido.';
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

        this.mensajeEscaneo = res.message || 'Marcación registrada.';
        this.tipoMensaje = 'exito';
        this.cerrarModalActividad();
        
        setTimeout(() => {
          this.mensajeEscaneo = '';
          this.escanearActivo = true;
          this.cdr.detectChanges();
        }, 3000);
      },
      error: (err) => {
        this.mensajeEscaneo = err.error?.message || 'Error al procesar marca.';
        this.tipoMensaje = 'error';
        setTimeout(() => { this.escanearActivo = true; }, 3000);
      }
    });
  }

  confirmarSalidaConActividad(actividadId: number): void {
    if (this.operadorPendienteSalidaId) {
      this.procesarMarca(this.operadorPendienteSalidaId, actividadId);
    }
  }

  cerrarModalActividad(): void {
    this.mostrarModalActividad = false;
    this.operadorPendienteSalidaId = null;
    this.escanearActivo = true;
  }
}
