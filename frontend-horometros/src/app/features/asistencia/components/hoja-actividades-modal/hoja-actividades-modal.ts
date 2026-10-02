import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Operador, RegistroActividad, Asistencia } from '../../../../core/models/asistencia.model';
import { NotificacionService } from '../../../../core/services/notificacion.service';

export interface HojaGrupo {
  operador: Operador;
  registros: RegistroActividad[];
  haciendaNombre: string | null;
  fecha: string;
  observacionesSupervisor: string | null;
}

// Hacienda a mostrar junto al nombre en la hoja imprimible (reemplaza el codigo_megued, que ya se repite en
// el carnet/QR - ver CLAUDE.md). Prioriza la hacienda de PRÉSTAMO de esa jornada puntual (si la asistencia la
// tiene, ver hacienda_prestamo_id) sobre la hacienda PERMANENTE del operador (vía su Supervisor).
export function resolverHaciendaJornada(operador: Operador, asistencia?: Asistencia): string | null {
  return asistencia?.haciendaPrestamo?.nombre
    || operador.supervisor?.hacienda?.nombre
    || null;
}

/*
Modal "Ver/Imprimir Hoja de Actividades": mismo diseño de la hoja física "REPORTES DE LABORES DIARIOS" que el
usuario compartió, como ventana FLOTANTE dentro de la misma pantalla (mismo patrón que "Ver Evidencia",
visor-foto.ts) en vez de una pestaña nueva - la app va empaquetada, así que abrir un link/ventana del
navegador aparte no tiene sentido ahí. Imprimir usa la propia ventana (window.print()) con el resto de la
pantalla oculto vía CSS de impresión (ver .imprimible en styles.css), no un documento aparte.

Extraído de asistencia-panel.ts (2026-10-02) a un componente compartido: el Panel de Supervisor también
necesita el mismo "Ver/Imprimir" por fila y el mismo "Imprimir General", y antes esto solo vivía ahí -
duplicar el modal completo (markup + CSS de impresión + lógica de compartir nativo) en dos páginas hubiera
significado mantener dos copias idénticas sincronizadas a mano. El padre solo necesita llamar a `abrir(...)`
vía una referencia de plantilla (#hojaModal, ver asistencia-panel.html/supervisor-panel.html).
*/
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-hoja-actividades-modal',
  styleUrl: './hoja-actividades-modal.css',
  templateUrl: './hoja-actividades-modal.html',
})
export class HojaActividadesModal {
  visible: boolean = false;
  grupos: HojaGrupo[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private notificacionService: NotificacionService,
  ) {}

  abrir(grupos: HojaGrupo[], opciones: { autoImprimir: boolean }): void {
    this.grupos = grupos;
    this.visible = true;
    this.cdr.detectChanges();

    // El print tiene que dispararse despues de que el modal ya este pintado en el DOM.
    if (opciones.autoImprimir) {
      setTimeout(() => this.imprimirHoja(), 150);
    }
  }

  cerrar(): void {
    this.visible = false;
    this.grupos = [];
    this.cdr.detectChanges();
  }

  /*
  window.print() no hace nada dentro del WebView de la app empaquetada - a diferencia de un navegador de
  escritorio, el WebView de Android no trae integrado el dialogo de impresion (ni Chrome ni Capacitor lo
  agregan solos), asi que los botones "Imprimir" quedaban sin efecto visible al tocarlos en el celular
  (reportado probando el .apk real). En nativo se comparte un resumen en texto plano via el selector nativo
  de Android en su lugar (enviar por WhatsApp/correo, o pegarlo en cualquier app) - la vista previa en
  pantalla (el modal, que sí funciona igual en ambos) sigue siendo la forma real de "ver" la hoja.
  */
  imprimirHoja(): void {
    if (Capacitor.isNativePlatform()) {
      this.compartirHoja();
      return;
    }
    window.print();
  }

  private async compartirHoja(): Promise<void> {
    try {
      await Share.share({
        title: 'Reporte de labores',
        dialogTitle: 'Compartir reporte',
        text: this.generarTextoHoja(),
      });
    } catch {
      this.notificacionService.error('No se pudo compartir el reporte.');
    }
  }

  private generarTextoHoja(): string {
    const lineas: string[] = [];
    for (const grupo of this.grupos) {
      const esOperador = grupo.operador.rol === 'OPERADOR';
      lineas.push(esOperador ? 'REPORTE DE LABORES MAQUINARIAS' : 'REPORTE DE LABORES DIARIOS');
      lineas.push(
        `${esOperador ? 'Operador' : 'Mecánico'}: ${grupo.operador.nombre_completo}` +
          (grupo.haciendaNombre ? ` · ${grupo.haciendaNombre}` : '')
      );
      lineas.push(`Fecha: ${grupo.fecha}`);
      lineas.push('');

      if (grupo.registros.length === 0) {
        lineas.push('Sin labores registradas.');
      } else {
        for (const reg of grupo.registros) {
          const equipo = reg.equipo ? `${reg.equipo.codigo_megued} - ${reg.equipo.nombre_equipo}` : '—';
          const detalle = esOperador
            ? `Horómetro ${reg.horometro_inicio ?? '—'} → ${reg.horometro_final ?? '—'}`
            : `OT ${reg.area || '—'}`;
          const observaciones = reg.observaciones ? ` | ${reg.observaciones}` : '';
          const horas = esOperador ? '' : ` | ${this.rangoHorasLabor(reg)}`;
          lineas.push(`${equipo} | ${detalle} | ${this.duracionLabor(reg)}${horas}${observaciones}`);
        }
      }

      lineas.push('');
      lineas.push(`Observaciones del Supervisor: ${grupo.observacionesSupervisor || 'Sin observaciones.'}`);
      lineas.push('');
    }
    return lineas.join('\n').trim();
  }

  /*
  Antes redondeaba a minutos enteros (Math.round) y descartaba los segundos - una labor de, ej., 40 segundos
  se mostraba como "0min", pareciendo mal calculada. Ahora se calcula con el total de segundos reales, sin
  redondear nada hasta el ultimo paso (truncar, no redondear - "47min 59s" no debe saltar a "48min").
  */
  duracionLabor(reg: RegistroActividad): string {
    if (!reg.hora_fin) return '—';
    const totalSegundos = Math.floor((new Date(reg.hora_fin).getTime() - new Date(reg.hora_inicio).getTime()) / 1000);
    if (totalSegundos < 0) return '—';
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) return `${horas}h ${minutos}min ${segundos}s`;
    if (minutos > 0) return `${minutos}min ${segundos}s`;
    return `${segundos}s`;
  }

  /*
  Reemplaza la columna "Taller/Campo" de la hoja imprimible (pedido del usuario, 2026-09-29): esa columna
  mostraba `actividad.categoria`, un dato FIJO del catálogo (lo define el Asistente al crear la Actividad, no
  algo que el Mecánico escriba por labor) - "Tiempo estimado" ya muestra la duración, pero nunca a qué hora
  empezó/terminó cada labor. hora_inicio/hora_fin ya viven en cada RegistroActividad (ver Panel de Actividades).
  */
  rangoHorasLabor(reg: RegistroActividad): string {
    const formato = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', {
      timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return `${formato(reg.hora_inicio)} - ${reg.hora_fin ? formato(reg.hora_fin) : '—'}`;
  }
}
