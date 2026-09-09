export interface Operador {
    id: number;
    codigo_megued: string;
    nombre_completo: string;
    cedula?: string;
    telefono?: string;
    direccion?: string;
}

export interface Actividad{
    id: number;
    codigo_megued: string;
    description: string;
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
    operador?: Operador;
    actividad?: Actividad[];
}