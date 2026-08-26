import express, {Application} from 'express';
import cors from 'cors';
import horometrosRoutes from './routes/horometros.routees';

const app: Application = express();

//Middleware Globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended:true }));

//Rutas
app.use('/api/horometros', horometrosRoutes);

//Ruta de comprobacion de estado (Healthcheck)
app.get('/api/health', (_req,res)=>{
    res.json({
        status: 'ok',
        message: 'Backend de Horometros operativo'
    })
});

export default app;
