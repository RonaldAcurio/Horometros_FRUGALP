import { Op } from 'sequelize';
import { RegistroPeticion } from '../models/registro_peticion';

// Retencion del historial de peticiones (pedido del usuario, 2026-10-05): es para investigar algo que paso
// "ahorita", un error real se tiene que arreglar a mas tardar al dia siguiente - no hace falta guardar mas de
// una semana, y borrar seguido mantiene la tabla chica para siempre (ver registrar-peticion.middleware.ts,
// RUTAS_DE_ALTO_VOLUMEN, que ya evita la mayor parte del volumen de entrada).
const DIAS_DE_RETENCION = 7;

/*
Borra las filas de registros_peticion mas viejas que DIAS_DE_RETENCION. Se llama una vez al arrancar el server
y despues cada 24h (ver index.ts) - no hace falta un cron de verdad (node-cron, etc.): Railway corre esto como
UN SOLO proceso siempre encendido, asi que un setInterval adentro del mismo proceso alcanza, sin agregar una
dependencia nueva solo para esto.
*/
export const limpiarRegistrosPeticionAntiguos = async (): Promise<void> => {
    try {
        const limite = new Date(Date.now() - DIAS_DE_RETENCION * 24 * 60 * 60 * 1000);
        // 'any': createdAt lo maneja Sequelize en runtime via 'timestamps' (ver registro_peticion.ts), pero no
        // esta declarado en la clase del modelo, asi que el tipado estricto de WhereOptions no lo reconoce -
        // mismo patron ya usado en registro_peticion.controller.ts (el 'where' de los filtros 'desde'/'hasta').
        const condicion: any = { createdAt: { [Op.lt]: limite } };
        const borrados = await RegistroPeticion.destroy({ where: condicion });
        if (borrados > 0) {
            console.log(`[peticion] Limpieza del historial: se borraron ${borrados} fila(s) de mas de ${DIAS_DE_RETENCION} dias.`);
        }
    } catch (err) {
        console.error('Error al limpiar el historial de peticiones antiguas (no es grave, se reintenta en 24h):', err);
    }
};
