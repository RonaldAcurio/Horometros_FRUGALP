import { CargoUsuario } from './auth.model';

export interface Usuario {
  id: number;
  nombre_completo: string;
  usuario: string;
  cargo: CargoUsuario;
  activo: boolean;
  hacienda_id: number | null;
  hacienda?: { id: number; nombre: string } | null;
  // Fecha en que aceptó la Política de Privacidad/Términos de Uso (gate del primer login) - null/undefined =
  // todavía no aceptó. Ya venía en la respuesta del backend (solo excluye clave_hash), faltaba tipar/mostrar.
  terminos_aceptados_en?: string | null;
}

// Lo que se manda al crear un Usuario nuevo (clave en texto plano, el backend la hashea).
export interface NuevoUsuario {
  nombre_completo: string;
  usuario: string;
  clave: string;
  cargo: CargoUsuario;
  hacienda_id?: number | null;
}
