import { Component, ChangeDetectorRef, ElementRef } from '@angular/core';
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
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  onCodeResult(resultString: string): void {
    try {
      const data = JSON.parse(resultString);
      if (data && data.operador_id) {
        this.escanearActivo = false;
        const fotoEvidencia = this.capturarFotoEvidencia();
        this.procesarMarca(data.operador_id, undefined, fotoEvidencia);
      }
    } catch (e) {
      this.mensajeEscaneo = 'Código QR no válido.';
      this.tipoMensaje = 'error';
    }
  }

  //Toma una "foto" del frame actual del video del escaner QR (si pedir un segundo de permiso de camara)
  private capturarFotoEvidencia():string | null {
    const videoElement = this.elementRef.nativeElement.querySelector('video') as HTMLVideoElement | null;

    // readyState >= 2 (HAVE_CURRENT_DATA) significa que el video ya tiene un fame real para dibujar
    if(!videoElement || videoElement.readyState < 2){
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const contexto = canvas.getContext('2d');
    if(!contexto) return null;

    contexto.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // JPEG con calidad 70% en vez de PNG: pesa mucho menos para viajar en el JSON
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  procesarMarca(operadorId: number, actividadesIds?: number[], fotoIngreso?: string | null): void {
    this.asistenciaService.registrarMarcaQR(operadorId, actividadesIds, fotoIngreso).subscribe({
      next: (res) => {
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
        // Caso especial: el backend responde 400 pidiendo actividades -> abrimos el modal
        if (err.status === 400 && err.error?.require_actividad) {
          this.operadorPendienteSalidaId = operadorId;
          this.mostrarModalActividad = true;
          this.cdr.detectChanges();
          return;
        }

        this.mensajeEscaneo = err.error?.message || 'Error al procesar marca.';
        this.tipoMensaje = 'error';
        setTimeout(() => { this.escanearActivo = true; }, 3000);
      }
    });
  }

  confirmarSalidaConActividad(actividadesIds: number[]): void {
    if (this.operadorPendienteSalidaId) {
      this.procesarMarca(this.operadorPendienteSalidaId, actividadesIds);
    }
  }

  cerrarModalActividad(): void {
    this.mostrarModalActividad = false;
    this.operadorPendienteSalidaId = null;
    this.escanearActivo = true;
  }
}
