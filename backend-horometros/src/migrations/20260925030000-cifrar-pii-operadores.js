'use strict';

const crypto = require('crypto');

/*
Cifra en reposo cedula/telefono/direccion de los Operadores que todavia esten en texto plano (ver CLAUDE.md,
"Cifrado de datos sensibles" y utils/cifrado.ts). Esta migracion reimplementa el MISMO algoritmo en JS plano
(las migraciones de Sequelize corren fuera de ts-node/tsx, sin acceso directo a los modulos TS del proyecto) -
si el algoritmo cambia alguna vez en utils/cifrado.ts, hay que replicar el cambio aca tambien.

REQUIERE 'CIFRADO_CLAVE' configurada en el entorno ANTES de correr esto (32 bytes en hex - generar con
'openssl rand -hex 32'). Sin ella, la migracion falla duro en vez de dejar datos sin cifrar por error.

IMPORTANTE - AVISAR SIEMPRE ANTES DE CORRER ESTO EN PRODUCCION: reescribe PII real de ~950 trabajadores
(cedula, telefono, direccion). Hacer un respaldo de la base de datos ANTES de correr 'npm run db:migrate' en
produccion. Es idempotente (un valor que ya empieza con 'enc1:' se salta, se puede interrumpir y correr de
nuevo sin duplicar el cifrado ni perder datos), pero un respaldo previo sigue siendo la unica forma real de
deshacer un problema (ej. CIFRADO_CLAVE mal configurada, o perdida despues de cifrar - sin la clave correcta
los datos cifrados quedan irrecuperables para siempre, no hay "reset").
*/

const ALGORITMO = 'aes-256-gcm';
const PREFIJO = 'enc1:';

function obtenerClave() {
  const clave = process.env.CIFRADO_CLAVE;
  if (!clave || clave.length !== 64) {
    throw new Error(
      "Falta configurar CIFRADO_CLAVE en las variables de entorno (32 bytes en hex, 64 caracteres - generar con: openssl rand -hex 32)."
    );
  }
  return Buffer.from(clave, 'hex');
}

function empaquetar(iv, authTag, cifrado) {
  return PREFIJO + Buffer.concat([iv, authTag, cifrado]).toString('base64');
}

function cifrar(texto, clave) {
  if (texto === null || texto === undefined || texto === '') return texto === undefined ? null : texto;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return empaquetar(iv, cipher.getAuthTag(), cifrado);
}

function cifrarDeterministico(texto, clave) {
  if (texto === null || texto === undefined || texto === '') return texto === undefined ? null : texto;
  const iv = crypto.createHmac('sha256', clave).update(texto).digest().subarray(0, 12);
  const cipher = crypto.createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return empaquetar(iv, cipher.getAuthTag(), cifrado);
}

function yaCifrado(valor) {
  return typeof valor === 'string' && valor.startsWith(PREFIJO);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // Ensanchar ANTES de escribir: el texto cifrado (base64 de iv+authTag+ciphertext, mas el prefijo) es
    // bastante mas largo que el original - ver models/operador.ts para el detalle de cada tamaño.
    // Sin 'unique: true' aca: la columna YA es unica (constraint creado por la migracion original que agrego
    // 'cedula' - 20260903054054). Repetir 'unique:true' en un changeColumn le agrega un SEGUNDO indice UNIQUE
    // redundante en vez de reconocer el que ya existe (bug real encontrado probando esto a mano).
    await queryInterface.changeColumn('operadores', 'cedula', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.changeColumn('operadores', 'telefono', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.changeColumn('operadores', 'direccion', { type: Sequelize.STRING(500), allowNull: true });

    const clave = obtenerClave();
    const [operadores] = await queryInterface.sequelize.query(
      'SELECT id, cedula, telefono, direccion FROM operadores'
    );

    for (const operador of operadores) {
      const cambios = {};
      if (operador.cedula && !yaCifrado(operador.cedula)) {
        cambios.cedula = cifrarDeterministico(operador.cedula, clave);
      }
      if (operador.telefono && !yaCifrado(operador.telefono)) {
        cambios.telefono = cifrar(operador.telefono, clave);
      }
      if (operador.direccion && !yaCifrado(operador.direccion)) {
        cambios.direccion = cifrar(operador.direccion, clave);
      }

      const campos = Object.keys(cambios);
      if (campos.length === 0) continue;

      const asignaciones = campos.map((campo, i) => `"${campo}" = :val${i}`).join(', ');
      const replacements = { id: operador.id };
      campos.forEach((campo, i) => { replacements['val' + i] = cambios[campo]; });

      await queryInterface.sequelize.query(
        `UPDATE operadores SET ${asignaciones} WHERE id = :id`,
        { replacements }
      );
    }
  },
  async down() {
    // Sin rollback automatico a proposito: revertir cifrado ya aplicado en produccion no es un
    // 'db:migrate:undo' de rutina, es una decision manual con la clave a mano.
    throw new Error('Esta migracion no tiene rollback automatico - revertir el cifrado requiere una decision manual.');
  },
};
