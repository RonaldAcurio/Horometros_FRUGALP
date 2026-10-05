/*
Estados de Asistencia que cuentan como "hoy ya no hay nada mas que hacer" para un Operador - ni el login
(auth.controller.ts) ni ninguna accion de su jornada (verificarJornadaOperadorActiva, auth.middleware.ts) lo
dejan seguir si su Asistencia de HOY ya cayo en alguno de estos. Antes vivia duplicado, caracter por caracter,
en esos 2 archivos - un solo lugar evita que alguien actualice uno y se le olvide el otro.
*/
export const ESTADOS_JORNADA_CERRADA: string[] = ['PENDIENTE_REVISION', 'FINALIZADO', 'SALIDA_OLVIDADA', 'OBSERVANDO'];
