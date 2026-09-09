import { Equipo } from "./equipo";
import { Operador } from "./operador";
import { Actividad } from "./actividad";
import { Ingresos_Semanales } from "./ingresos_semanales";
import { Asistencia } from "./asistencias";
import { AsistenciaActividad } from "./asistencia_actividad";

//Un Ingreso Semanal pertenece a un equipo
Ingresos_Semanales.belongsTo(Equipo,{ foreignKey:'equipo_id', as:'equipo'});
Equipo.hasMany(Ingresos_Semanales,{ foreignKey:'equipo_id', as:'ingresos'});

//Un Ingreso Semanal pertenece a un operador
Ingresos_Semanales.belongsTo(Operador,{ foreignKey:'operador_id', as:'operador'});
Operador.hasMany(Ingresos_Semanales,{ foreignKey:'operador_id', as:'ingresos'});

//Un Ingreso Semanal pertenece a una actividad
Ingresos_Semanales.belongsTo(Actividad,{ foreignKey:'actividad_id', as:'actividad'});
Actividad.hasMany(Ingresos_Semanales,{ foreignKey:'actividad_id', as:'ingresos'});

Asistencia.belongsTo(Operador, { foreignKey:'operador_id' ,as:'operador'});
Asistencia.belongsTo(Actividad,{ foreignKey: 'actividad_id', as:'actividad'});
Operador.hasMany(Asistencia, {foreignKey: 'operador_id', as:'asistencia'});

Asistencia.belongsToMany(Actividad,{
    through: AsistenciaActividad,
    foreignKey: 'asistencia_id',
    otherKey: 'actividad_id',
    as: 'actividades'
});
Actividad.belongsToMany(Asistencia,{
    through:AsistenciaActividad,
    foreignKey: 'actividad_id',
    otherKey:'asistencia_id',
    as: 'asistenciaRelacionadas' 
});

export{
    Equipo,
    Operador,
    Actividad,
    Ingresos_Semanales,
    Asistencia,
    AsistenciaActividad,
};