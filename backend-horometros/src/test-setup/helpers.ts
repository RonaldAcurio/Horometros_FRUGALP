import bcrypt from 'bcryptjs';
import { Usuario } from '../models/usuario';
import { Operador } from '../models/operador';
import { RegistroAuditoria } from '../models/registro_auditoria';
import { Hacienda } from '../models/hacienda';

/*
Helpers compartidos por las pruebas de integracion (ver CLAUDE.md, "Pruebas de integracion"). Todo esto corre
contra la BD de TEST real (ver config/database.ts, NODE_ENV=test) - nunca contra development/produccion.
*/

// Orden por las FK, igual que cualquier limpieza manual de esta BD (ver CLAUDE.md sobre el bug de orden de
// deletes de sesiones anteriores): RegistroAuditoria y Operador referencian a Usuario, Usuario referencia a
// Hacienda - hay que borrar en ese orden o Postgres rechaza el DELETE por la FK.
export const limpiarBaseDeDatosTest = async (): Promise<void> => {
    await RegistroAuditoria.destroy({ where: {}, force: true });
    await Operador.destroy({ where: {}, force: true });
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
