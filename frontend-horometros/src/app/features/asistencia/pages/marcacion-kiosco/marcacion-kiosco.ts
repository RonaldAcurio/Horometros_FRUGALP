import { Component, ChangeDetectorRef, ElementRef, OnDestroy, NgZone } from '@angular/core';
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
export class MarcacionKiosco implements OnDestroy {
  escanearActivo: boolean = true;
  procesando: boolean = false;
  mensajeEscaneo: string = '';
  tipoMensaje: 'exito' | 'error' | 'info' = 'info';

  mostrarModalActividad: boolean = false;
  operadorPendienteSalidaId: number | null = null;

  constructor(
    private asistenciaService: AsistenciaService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    private ngZone : NgZone,
  ) {}

  /*
  Red de seguridad: si el usuario navega a otra pantalla mientras la camara esta activa, nos aseguramos
  de apagarla igual, sin depender de que la libreria lo haga por su cuenta
  */
 ngOnDestroy(): void {
   this.detenerCamara();
 }

  onCodeResult(resultString: string): void {

    //Guarda de re-entrada: si ya estamos procesando un escaneo, ignoramos cualquier otro disparo
    if(this.procesando || !this.escanearActivo){
      return;
    }

    /*
    @zxing/ngx-scanner decodifica fuera de la zona de Angular por rendimiento.
    Forzamos el reingreso para que todo lo que pase despues(abrir el modal y sus controles)
    quede correctamente "vigilado" por Angular.
    */
   this.ngZone.run(() => {
      try {
        const data = JSON.parse(resultString);
        if (data && data.operador_id) {
          this.procesando = true;
          this.escanearActivo = false;
          const fotoEvidencia = this.capturarFotoEvidencia();
          this.procesarMarca(data.operador_id, undefined, fotoEvidencia);
        }
      } catch (e) {
        this.mensajeEscaneo = 'Código QR no válido.';
        this.tipoMensaje = 'error';
      }
   });

    
  }

  /*
  Toma el stream real de la camara desde el <video> y detiene cada pista (track).
  ESto apaga la camara a nivel de navegador, sin depender de la limpieza interna de zxing
  */
  private detenerCamara():void{
    const videoElemento = this.elementRef.nativeElement.querySelector('video') as HTMLVideoElement | null;
    const stream = videoElemento?.srcObject as MediaStream | null;

    if(stream){
      stream.getTracks().forEach(track => track.stop());
    }
  }

  //Toma una "foto" del frame actual del video del escaner QR (si pedir un segundo de permiso de camara)
  private capturarFotoEvidencia():string | null {
    const videoElement = this.elementRef.nativeElement.querySelector('video') as HTMLVideoElement | null;

    // readyState >= 2 (HAVE_CURRENT_DATA) significa que el video ya tiene un fame real para dibujar
    if(!videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0 || videoElement.videoHeight === 0){
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
          this.procesando = false;
          this.cdr.detectChanges();
        }, 3000);
      },
      error: (err) => {
        // Caso especial: el backend responde 400 pidiendo actividades -> abrimos el modal
        if (err.status === 400 && err.error?.require_actividad) {
          this.operadorPendienteSalidaId = operadorId;
          this.mostrarModalActividad = true;
          this.procesando = false; //liberamos la guarda: ahora esperamos al usuario, no al escaner
          this.cdr.detectChanges();
          return;
        }

        this.mensajeEscaneo = err.error?.message || 'Error al procesar marca.';
        this.tipoMensaje = 'error';
        this.procesando = false;
        setTimeout(() => { this.escanearActivo = true; }, 3000);
      }
    });
  }

  confirmarSalidaConActividad(actividadesIds: number[]): void {
    if (this.operadorPendienteSalidaId) {
      this.procesando = true;
      this.procesarMarca(this.operadorPendienteSalidaId, actividadesIds);
    }
  }

  cerrarModalActividad(): void {
    this.mostrarModalActividad = false;
    this.operadorPendienteSalidaId = null;
    this.escanearActivo = true;
    this.procesando = false;
    this.cdr.detectChanges;
  }
}
