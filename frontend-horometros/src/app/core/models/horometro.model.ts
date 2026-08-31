export interface DatosIA {
  nombre_maquinaria: string | null;
  numero_tractor: string | null;
  nombre_operador: string | null;
  fecha: string | null;
  codigo_labor: string | null;
  seccion: string | null;
  km_inicial: number | null;
  km_final: number | null;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
  observaciones: string;
}

export interface MapeoEntidad {
  id: number;
  nombre?: string;
  descripcion?: string;
  codigo: string;
}

export interface MapeosBD {
  equipo: MapeoEntidad | null;
  operador: MapeoEntidad | null;
  actividad: MapeoEntidad | null;
}

export interface ReporteProcesado {
  datosExtraidos: DatosIA;
  mapeosBD: MapeosBD;
  calculos: {
    km_inicial: number;
    km_Final: number;
    total_horas: number;
  };
  // Propiedades auxiliares para la vista de edición
  equipo_id_seleccionado?: number;
  operador_id_seleccionado?: number;
  actividad_id_seleccionado?: number;
  esEditable?: boolean;
}

export interface RespuestaLote {
  exito: boolean;
  total_procesados: number;
  mensaje: string;
  reportesOrdenados: ReporteProcesado[];
}

export interface ConfirmarIngresoPayload {
  equipo_id: number;
  operador_id: number;
  actividad_id: number;
  seccion?: string;
  km_inicial: number;
  km_final: number;
  total_horas: number;
  fecha: string;
}

export interface ResumenMEGUED {
  ultimo_km_Inicial: number;
  horas_sumadas: number;
  nuevo_km_final: number;
  lectura_fisica_tablero: number;
}

export interface RespuestaConfirmacion {
  exito: boolean;
  mensaje: string;
  data: any;
  resumenMEGUED: ResumenMEGUED;
}