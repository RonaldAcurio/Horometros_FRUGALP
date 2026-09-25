import { RegistroAuditoria, AccionAuditoria, ObjetivoAuditoria } from '../models/registro_auditoria';

/*
Un solo punto de entrada para escribir en el historial de auditoria (ver CLAUDE.md) - lo llaman los controllers
de reseteo de clave (usuario/operador) y de Token de Hacienda (generar/invalidar), siempre DESPUES de que la
accion principal ya se confirmo en la BD. Nunca deja que un fallo ACA (guardar el registro de auditoria) tumbe
la respuesta de esa accion principal, que ya se ejecuto correctamente - solo lo deja en el log del servidor.
*/
export const registrarAuditoria = async (datos: {
    actorUsuarioId: number;
    accion: AccionAuditoria;
    objetivoTipo: ObjetivoAuditoria;
    objetivoId: number;
    objetivoNombre: string;
}): Promise<void> => {
    try{
        await RegistroAuditoria.create({
            actor_usuario_id: datos.actorUsuarioId,
            accion: datos.accion,
            objetivo_tipo: datos.objetivoTipo,
            objetivo_id: datos.objetivoId,
            objetivo_nombre: datos.objetivoNombre,
        });
    }catch(err){
        console.error('Error al registrar auditoria (la accion principal ya se ejecuto, esto no la afecta):', err);
    }
};
