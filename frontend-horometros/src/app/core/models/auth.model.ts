// Cargos de cuentas de oficina (tabla 'usuarios' en el backend).
export type CargoUsuario = 'ADMIN' | 'ASISTENTE' | 'SUPERVISOR' | 'ESCANER';

// El backend no distingue 'tipo' en el perfil que devuelve - alcanza con 'rol', porque los valores de
// CargoUsuario y los de Operador (MECANICO/OPERADOR) nunca se pisan entre si.
export type RolCuenta = CargoUsuario | 'MECANICO' | 'OPERADOR';

export interface PerfilCuenta {
  id: number;
  nombre_completo: string;
  rol: RolCuenta;
  hacienda_id: number | null;
  // Solo viene en cuentas de oficina con hacienda fija (SUPERVISOR/ESCANER) - de solo lectura,
  // el login nunca deja elegir la hacienda (ver CLAUDE.md).
  hacienda_nombre?: string | null;
  /*
  Solo viene en cuentas MECANICO/OPERADOR: decide, ya en el login, cual de los 2 caminos le toca a este
  trabajador. true = su hacienda tiene el Token de Hacienda vigente ("codigo activo") -> DEBE marcar con
  codigo, nunca con QR. false = su hacienda no tiene token vigente (o no tiene hacienda todavia) -> le toca
  el QR flotante. Es estricto: nunca se le ofrecen los dos caminos a la vez (ver CLAUDE.md).
  */
  hacienda_requiere_codigo?: boolean;
}

export interface RespuestaLogin {
  token: string;
  perfil: PerfilCuenta;
}
