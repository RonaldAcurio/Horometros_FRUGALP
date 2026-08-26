import multer from 'multer';

const storage = multer.memoryStorage(); // Almacena los archivos en memoria y no en el disco

export const upload = multer({
    storage: storage,
    limits:{
        fileSize: 5 * 1024 * 1024,// Limite de tamaño de archivo: 5MB
    },
});