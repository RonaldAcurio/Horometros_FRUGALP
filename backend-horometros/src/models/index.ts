import { Equipo } from "./equipo";
import { Operador } from "./operador";
import { Actividad } from "./actividad";
import { Asistencia } from "./asistencias";
import { AsistenciaActividad } from "./asistencia_actividad";
import { Seccion } from "./seccion";
import { RegistroActividad } from "./registro_actividad";
import { Hacienda } from "./hacienda";
import { Usuario } from "./usuario";

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

// Panel de Actividades: cada fila cuelga de la jornada (Asistencia) del trabajador
RegistroActividad.belongsTo(Asistencia, { foreignKey: 'asistencia_id', as: 'asistencia' });
Asistencia.hasMany(RegistroActividad, { foreignKey: 'asistencia_id', as: 'registros' });

RegistroActividad.belongsTo(Equipo, { foreignKey: 'equipo_id', as: 'equipo' });
Equipo.hasMany(RegistroActividad, { foreignKey: 'equipo_id', as: 'registros' });

RegistroActividad.belongsTo(Actividad, { foreignKey: 'actividad_id', as: 'actividad' });
Actividad.hasMany(RegistroActividad, { foreignKey: 'actividad_id', as: 'registros' });

RegistroActividad.belongsTo(Seccion, { foreignKey: 'seccion_id', as: 'seccion' });
Seccion.hasMany(RegistroActividad, { foreignKey: 'seccion_id', as: 'registros' });

Usuario.belongsTo(Hacienda, { foreignKey: 'hacienda_id', as: 'hacienda' });
Hacienda.hasMany(Usuario, { foreignKey: 'hacienda_id', as: 'usuarios' });

Seccion.belongsTo(Hacienda, { foreignKey: 'hacienda_id', as: 'hacienda' });
Hacienda.hasMany(Seccion, { foreignKey: 'hacienda_id', as: 'secciones' });

Operador.belongsTo(Usuario, { foreignKey: 'supervisor_id', as: 'supervisor' });
Usuario.hasMany(Operador, { foreignKey: 'supervisor_id', as: 'operadores' });

Asistencia.belongsTo(Hacienda, { foreignKey: 'hacienda_prestamo_id', as: 'haciendaPrestamo' });
Asistencia.belongsTo(Usuario, { foreignKey: 'admitido_por_usuario_id', as: 'admitidoPor' });

export{
    Equipo,
    Operador,
    Actividad,
    Asistencia,
    AsistenciaActividad,
    Seccion,
    RegistroActividad,
    Hacienda,
    Usuario,
};