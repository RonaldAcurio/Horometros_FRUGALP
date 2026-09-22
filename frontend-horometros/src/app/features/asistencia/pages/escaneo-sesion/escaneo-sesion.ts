import { Component, ChangeDetectorRef, ElementRef, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { ModalActividad } from '../../components/modal-actividad/modal-actividad';

/*
Escaneo de Camino B (QR flotante de 90s de un Operador/Mecanico YA logueado, ver mi-jornada). Distinto del
kiosco clasico (marcacion-kiosco: carnet fisico impreso, sin login, payload JSON {operador_id}) - aca el QR trae
un JWT firmado de corta vida (qr_token), y quien escanea SI necesita estar logueado como SUPERVISOR o ESCANER
(ver requireRol en la ruta marcar-qr-sesion). Structuralmente muy similar al kiosco por diseno (misma logica de
camara/evidencia) - se mantienen separados porque son dos caminos de negocio distintos, no el mismo flujo.
*/
@Component({
  standalone: true,
  imports: [CommonModule, ZXingScannerModule, ModalActividad],
  selector: 'app-escaneo-sesion',
  styleUrl: './escaneo-sesion.css',
  templateUrl: './escaneo-sesion.html',
})
export class EscaneoSesion implements OnDestroy {
  escanearActivo: boolean = true;
  procesando: boolean = false;
  mensajeEscaneo: string = '';
  tipoMensaje: 'exito' | 'error' | 'info' = 'info';

  mostrarModalActividad: boolean = false;
  qrTokenPendienteSalida: string | null = null;

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    private ngZone: NgZone,
  ) {}

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  onCodeResult(resultString: string): void {
    if (this.procesando || !this.escanearActivo) {
      return;
    }

    this.ngZone.run(() => {
      this.procesando = true;
      this.escanearActivo = false;
      const fotoEvidencia = this.capturarFotoEvidencia();
      this.procesarEscaneo(resultString, undefined, fotoEvidencia);
    });
  }

  private detenerCamara(): void {
    const videoElemento = this.elementRef.nativeElement.querySelector('video') as HTMLVideoElement | null;
    const stream = videoElemento?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  private capturarFotoEvidencia(): string | null {
    const videoElement = this.elementRef.nativeElement.querySelector('video') as HTMLVideoElement | null;
    if (!videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const contexto = canvas.getContext('2d');
    if (!contexto) return null;
    contexto.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  procesarEscaneo(qrToken: string, actividadesIds?: number[], fotoIngreso?: string | null): void {
    this.asistenciaService.marcarConQrSesion(qrToken, actividadesIds, fotoIngreso).subscribe({
      next: (res) => {
        this.mensajeEscaneo = res.message || 'Marcación registrada.';
        this.tipoMensaje = 'exito';
        this.cerrarModalActividad();

        setTimeout(() => {
          this.mensajeEscaneo = '';
          this.escanearActivo = true;
          this.procesando = false;
          this.cdr.detectChanges();
        }, 3000);
      },
      error: (err) => {
        if (err.status === 400 && err.error?.require_actividad) {
          this.qrTokenPendienteSalida = qrToken;
          this.mostrarModalActividad = true;
          this.procesando = false;
          this.cdr.detectChanges();
          return;
        }

        this.mensajeEscaneo = err.error?.message || 'Error al procesar el escaneo.';
        this.tipoMensaje = 'error';
        this.procesando = false;
        setTimeout(() => { this.escanearActivo = true; this.cdr.detectChanges(); }, 3000);
        this.cdr.detectChanges();
      }
    });
  }

  confirmarSalidaConActividad(actividadesIds: number[]): void {
    if (this.qrTokenPendienteSalida) {
      this.procesando = true;
      this.procesarEscaneo(this.qrTokenPendienteSalida, actividadesIds);
    }
  }

  cerrarModalActividad(): void {
    this.mostrarModalActividad = false;
    this.qrTokenPendienteSalida = null;
    this.escanearActivo = true;
    this.procesando = false;
    this.cdr.detectChanges();
  }
}
