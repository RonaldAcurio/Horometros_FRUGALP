import bcrypt from 'bcryptjs';
import { Usuario } from '../models/usuario';
import { Operador } from '../models/operador';
import { RegistroAuditoria } from '../models/registro_auditoria';
import { Hacienda } from '../models/hacienda';
import { CierreJornada } from '../models/cierre_jornada';
import { Seccion } from '../models/seccion';
import { RegistroActividad } from '../models/registro_actividad';
import { Asistencia } from '../models/asistencias';
import { Equipo } from '../models/equipo';
import { Actividad } from '../models/actividad';
import { TokenHacienda } from '../models/token_hacienda';

/*
Helpers compartidos por las pruebas de integracion (ver CLAUDE.md, "Pruebas de integracion"). Todo esto corre
contra la BD de TEST real (ver config/database.ts, NODE_ENV=test) - nunca contra development/produccion.
*/

// Orden por las FK, igual que cualquier limpieza manual de esta BD (ver CLAUDE.md sobre el bug de orden de
// deletes de sesiones anteriores): RegistroActividad referencia a Asistencia/Equipo/Actividad/Seccion, y
// Asistencia referencia a Operador - tienen que ir ANTES que esas tablas o Postgres rechaza el DELETE por la
// FK (bug real encontrado al agregar las pruebas de editar/eliminar labor, mismo patron que el de Seccion mas
// abajo). RegistroAuditoria, Operador y CierreJornada referencian a Usuario (y CierreJornada tambien a
// Hacienda), Usuario y Seccion referencian a Hacienda - hay que borrar en ese orden o Postgres rechaza el
// DELETE por la FK. Seccion tiene que ir ANTES que Hacienda (su FK es RESTRICT, no SET NULL como la de
// Operador.seccion_id) - sin esto, cualquier prueba que cree una Seccion deja a la siguiente corrida sin poder
// limpiar la BD (bug real encontrado al agregar las pruebas de Secciones).
export const limpiarBaseDeDatosTest = async (): Promise<void> => {
    await RegistroActividad.destroy({ where: {}, force: true });
    await Asistencia.destroy({ where: {}, force: true });
    await RegistroAuditoria.destroy({ where: {}, force: true });
    await CierreJornada.destroy({ where: {}, force: true });
    // TokenHacienda referencia tanto a Hacienda como a Usuario (generado_por_usuario_id) - tiene que ir ANTES
    // que los dos o Postgres rechaza esos DELETE por la FK (mismo patron que el resto de esta funcion; bug real
    // encontrado al agregar specs e2e que generan un Token de Hacienda).
    await TokenHacienda.destroy({ where: {}, force: true });
    await Operador.destroy({ where: {}, force: true });
    await Equipo.destroy({ where: {}, force: true });
    await Actividad.destroy({ where: {}, force: true });
    await Seccion.destroy({ where: {}, force: true });
    await Usuario.destroy({ where: {}, force: true });
    await Hacienda.destroy({ where: {}, force: true });
};

/*
Crea un Usuario de oficina directo por Sequelize (no por HTTP): no existe un endpoint publico para crear el
PRIMER Admin (huevo y gallina, ver CLAUDE.md "Cuenta ADMIN de arranque" - en produccion se hizo por SQL a mano).
'terminos_aceptados_en' por defecto ya viene con fecha, para no interferir con pruebas que no son sobre el gate
de Terminos.
*/
export const crearUsuarioDePrueba = async (datos: {
    usuario: string;
    clave: string;
    cargo: 'ADMIN' | 'ASISTENTE' | 'SUPERVISOR' | 'ESCANER';
    nombre_completo?: string;
    hacienda_id?: number | null;
    terminos_aceptados_en?: Date | null;
}): Promise<Usuario> => {
    const clave_hash = await bcrypt.hash(datos.clave, 10);
    return Usuario.create({
        nombre_completo: datos.nombre_completo ?? `Test ${datos.usuario}`,
        usuario: datos.usuario,
        clave_hash,
        cargo: datos.cargo,
        hacienda_id: datos.hacienda_id ?? null,
        terminos_aceptados_en: datos.terminos_aceptados_en === undefined ? new Date() : datos.terminos_aceptados_en,
    });
};
