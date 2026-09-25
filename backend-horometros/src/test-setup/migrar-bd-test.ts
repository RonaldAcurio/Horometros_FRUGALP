import { execSync } from 'child_process';

/*
GlobalSetup de Vitest (ver vitest.integration.config.mts): corre las migraciones reales contra la BD de TEST
antes de que arranque cualquier archivo de prueba, para que el esquema este siempre al dia - nunca
sequelize.sync(), que podria divergir de lo que las migraciones realmente definen (la misma fuente de verdad
que development/produccion). Corre UNA sola vez por corrida completa, no por archivo de test.

NODE_ENV=test se fija ACA explicitamente (no se asume heredado del entorno de Vitest) porque este script lanza
un proceso HIJO separado (sequelize-cli) - asi funciona igual sin importar como Vitest propague sus propias
variables a un globalSetup.
*/
export default async function migrarBaseDeDatosTest(): Promise<void> {
    execSync('npx sequelize-cli db:migrate', {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' },
    });
}
