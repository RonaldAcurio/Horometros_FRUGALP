import { Component, ChangeDetectorRef, ElementRef, OnDestroy, NgZone } from '@angular/core';

import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { Result } from '@zxing/library';
import { AsistenciaService } from '../../../../core/services/asistencia.service';
import { ModalActividad } from '../../components/modal-actividad/modal-actividad';
import {
  resultadoDentroDeZonaActiva,
  dimensionesRedimensionadas,
} from '../../../../core/utils/zona-captura.util';

/*
Escaneo de Camino B (QR flotante de 90s de un Operador/Mecanico YA logueado, ver mi-jornada). Distinto del
kiosco clasico (marcacion-kiosco: carnet fisico impreso, sin login, payload JSON {operador_id}) - aca el QR trae
un JWT firmado de corta vida (qr_token), y quien escanea SI necesita estar logueado como SUPERVISOR o ESCANER
(ver requireRol en la ruta marcar-qr-sesion). Structuralmente muy similar al kiosco por diseno (misma logica de
camara/evidencia) - se mantienen separados porque son dos caminos de negocio distintos, no el mismo flujo.
*/
@Component({
  standalone: true,
  imports: [ZXingScannerModule, ModalActividad],
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

  /*
  Recibe el Result completo de ZXing (no solo el texto) para revisar DONDE cayo el QR - mismo motivo y mismo
  mecanismo que marcacion-kiosco.ts (ver zona-captura.util.ts). Un QR leido fuera del recuadro visible se
  ignora en silencio, la camara sigue escaneando.
  */
  onCodeResult(resultado: Result): void {
    if (this.procesando || !this.escanearActivo) {
      return;
    }

    const videoElement = this.elementRef.nativeElement.querySelector(
      'video',
    ) as HTMLVideoElement | null;
    if (
      !videoElement ||
      !resultadoDentroDeZonaActiva(
        resultado.getResultPoints(),
        videoElement.videoWidth,
        videoElement.videoHeight,
      )
    ) {
      return;
    }

    this.ngZone.run(() => {
      this.procesando = true;
      this.escanearActivo = false;
      const fotoEvidencia = this.capturarFotoEvidencia();
      this.procesarEscaneo(resultado.getText(), undefined, fotoEvidencia);
    });
  }

  private detenerCamara(): void {
    const videoElemento = this.elementRef.nativeElement.querySelector(
      'video',
    ) as HTMLVideoElement | null;
    const stream = videoElemento?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  // Mismo aviso de permiso/camara que marcacion-kiosco.ts (ver ahi el detalle) - antes se quedaba en silencio
  // para siempre si el permiso se negaba o no habia camara disponible.
  onPermisoCamara(concedido: boolean): void {
    if (concedido) return;
    this.mensajeEscaneo = 'No se pudo acceder a la cámara. Revisa que la app/el navegador tenga permiso de cámara y vuelve a intentar.';
    this.tipoMensaje = 'error';
    this.cdr.detectChanges();
  }

  onCamarasNoEncontradas(): void {
    this.mensajeEscaneo = 'No se encontró ninguna cámara en este dispositivo.';
    this.tipoMensaje = 'error';
    this.cdr.detectChanges();
  }

  // Captura el video COMPLETO (100%, no solo la zona activa) y lo redimensiona - mismo motivo que
  // marcacion-kiosco.ts (capturarFotoEvidencia).
  private capturarFotoEvidencia(): string | null {
    const videoElement = this.elementRef.nativeElement.querySelector(
      'video',
    ) as HTMLVideoElement | null;
    if (
      !videoElement ||
      videoElement.readyState < 2 ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return null;
    }
    const { width, height } = dimensionesRedimensionadas(
      videoElement.videoWidth,
      videoElement.videoHeight,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
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
        setTimeout(() => {
          this.escanearActivo = true;
          this.cdr.detectChanges();
        }, 3000);
        this.cdr.detectChanges();
      },
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
