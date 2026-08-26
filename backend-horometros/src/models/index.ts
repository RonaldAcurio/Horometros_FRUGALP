import { Equipo } from "./equipo";
import { Operador } from "./operador";
import { Actividad } from "./actividad";
import { Ingresos_Semanales } from "./ingresos_semanales";

//Un Ingreso Semanal pertenece a un equipo
Ingresos_Semanales.belongsTo(Equipo,{ foreignKey:'equipo_id', as:'equipo'});
Equipo.hasMany(Ingresos_Semanales,{ foreignKey:'equipo_id', as:'ingresos'});

//Un Ingreso Semanal pertenece a un operador
Ingresos_Semanales.belongsTo(Operador,{ foreignKey:'operador_id', as:'operador'});
Operador.hasMany(Ingresos_Semanales,{ foreignKey:'operador_id', as:'ingresos'});

//Un Ingreso Semanal pertenece a una actividad
Ingresos_Semanales.belongsTo(Actividad,{ foreignKey:'actividad_id', as:'actividad'});
Actividad.hasMany(Ingresos_Semanales,{ foreignKey:'actividad_id', as:'ingresos'});

export{
    Equipo,
    Operador,
    Actividad,
    Ingresos_Semanales,
};