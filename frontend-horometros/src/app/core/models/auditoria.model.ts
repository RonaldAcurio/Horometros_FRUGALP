// Ver CLAUDE.md ("Historial de auditoría") y registro_auditoria.ts (backend) para el detalle de cada campo.
export type AccionAuditoria =
  | 'RESETEAR_CLAVE_USUARIO'
  | 'RESETEAR_CLAVE_OPERADOR'
  | 'CAMBIAR_CREDENCIALES_OPERADOR'
  | 'GENERAR_TOKEN_HACIENDA'
  | 'INVALIDAR_TOKEN_HACIENDA';

export interface RegistroAuditoria {
  id: number;
  accion: AccionAuditoria;
  objetivo_tipo: 'usuario' | 'operador' | 'hacienda';
  objetivo_id: number;
  objetivo_nombre: string;
  createdAt: string;
  // JOIN en vivo contra 'usuarios' (a diferencia de objetivo_nombre, que va "congelado") - puede venir null si
  // el backend no pudo resolverlo, aunque en la practica un actor siempre existe (viene de req.auth).
  actor: { nombre_completo: string; cargo: string } | null;
}

// Misma forma de respuesta paginada que ya usa obtenerHistorial (asistencia.model.ts) - GET /api/auditoria.
export interface RespuestaAuditoria {
  data: RegistroAuditoria[];
  total: number;
  pagina: number;
  totalPaginas: number;
}
