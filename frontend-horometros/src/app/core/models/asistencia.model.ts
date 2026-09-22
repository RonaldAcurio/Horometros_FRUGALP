export interface Operador {
    id: number;
    codigo_megued: string;
    nombre_completo: string;
    cedula?: string;
    telefono?: string;
    direccion?: string;
    rol?: 'MECANICO' | 'OPERADOR';
    // Credenciales de acceso (opcionales, van siempre juntas usuario+clave). 'usuario' se puede leer (para
    // mostrarlo), la clave nunca viaja de vuelta del backend - solo se manda al crear/resetear.
    supervisor_id?: number | null;
    usuario?: string | null;
}

export interface Actividad{
    id: number;
    codigo_megued: string;
    description: string;
}

export interface Equipo {
    id: number;
    codigo_megued: string;
    nombre_equipo: string;
}

// Panel de Actividades: una labor puntual dentro de la jornada abierta de un Operador/Mecanico. 'seccion_id',
// 'horometro_inicio' y 'horometro_final' son de fase 2 (hoy siempre quedan en null, ver CLAUDE.md) - no se piden
// en el formulario todavia.
export interface RegistroActividad {
    id: number;
    asistencia_id: number;
    equipo_id: number;
    actividad_id: number;
    area?: string | null;
    observaciones?: string | null;
    hora_inicio: string;
    hora_fin?: string | null;
    equipo?: Equipo;
    actividad?: Actividad;
}

export interface Asistencia {
    id: number;
    operador_id: number;
    actividad_id?: number;
    fecha: string;
    hora_ingreso: string;
    hora_salida?: string;
    estado: 'EN_JORNADA' | 'PENDIENTE_REVISION' | 'FINALIZADO' | 'SALIDA_OLVIDADA';
    observaciones?: string;
    total_horas?: number | null;
    /*
    La foto ya no viaja en los listados (hoy/historial) para no cargar decenas de fotos de una sola vez:
    el backend manda "tiene_foto" (liviano) y la imagen se pide aparte, solo cuando el usuario hace clic 
    en " Ver Evidencia" (ver AsistenciaService).
    */
    foto_ingreso?: string | null;
    tiene_foto?: boolean;
    operador?: Operador;
    actividad?: Actividad;
    actividades?: Actividad[];
}