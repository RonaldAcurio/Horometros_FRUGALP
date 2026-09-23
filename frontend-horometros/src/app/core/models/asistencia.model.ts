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
    // TALLER (MECANICO) o CAMPO (OPERADOR) - lo usa la columna "TALLER-CAMPO" del reporte imprimible.
    categoria?: 'TALLER' | 'CAMPO';
}

export interface Equipo {
    id: number;
    codigo_megued: string;
    nombre_equipo: string;
}

// Respuesta paginada, mismo patrón que usa el Supervisor para el Historial/Registro de hoy (ver
// obtenerAsistenciasHoy) - la reusan los catálogos de Equipos/Actividades del Panel de Actividades.
export interface RespuestaPaginada<T> {
    data: T[];
    total: number;
    pagina: number;
    totalPaginas: number;
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
    // Solo viene en obtenerPorOperador (reporte imprimible) - obtenerPorAsistencia no lo necesita, ya sabe la
    // jornada de la que está preguntando.
    asistencia?: { id: number; fecha: string; operador_id: number };
}

export interface Asistencia {
    id: number;
    operador_id: number;
    actividad_id?: number;
    fecha: string;
    hora_ingreso: string;
    hora_salida?: string;
    estado: 'EN_JORNADA' | 'PENDIENTE_REVISION' | 'FINALIZADO' | 'SALIDA_OLVIDADA' | 'OBSERVANDO';
    observaciones?: string;
    total_horas?: number | null;
    // O/X del Supervisor: confirma si el trabajador que aparece logueado hoy realmente vino. null/undefined =
    // todavía sin confirmar.
    confirmado_por_supervisor?: boolean | null;
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