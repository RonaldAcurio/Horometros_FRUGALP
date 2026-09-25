import { sequelize } from '../config/database';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from './helpers';

/*
Siembra la BD de test con una cuenta ADMIN fija antes de correr las pruebas end-to-end (ver CLAUDE.md, "Pruebas
end-to-end"). Se ejecuta UNA vez, antes de levantar el backend (ver package.json, script 'e2e:server') - a
diferencia de las pruebas de integracion, que limpian entre cada test, e2e corre contra un solo estado inicial
fijo porque las pruebas navegan la UI real de punta a punta (mas lento) y comparten esa misma cuenta.

Usuario/clave fijos a proposito (no aleatorios): los specs de Playwright (frontend-horometros/e2e/) los
necesitan saber de antemano para loguearse.
*/
const ADMIN_E2E = { usuario: 'e2e_admin', clave: 'E2ePrueba123', cargo: 'ADMIN' as const };

const sembrar = async (): Promise<void> => {
    await limpiarBaseDeDatosTest();
    await crearUsuarioDePrueba({
        ...ADMIN_E2E,
        nombre_completo: 'E2E Admin',
        terminos_aceptados_en: new Date(), // ya acepto - los specs de login prueban el gate por separado, con su propia cuenta
    });
    console.log(`Sembrado: cuenta ADMIN "${ADMIN_E2E.usuario}" lista para e2e.`);
    await sequelize.close();
};

sembrar().catch((err) => {
    console.error('Error al sembrar datos de e2e:', err);
    process.exit(1);
});
