import { GoogleGenAI } from '@google/genai';

export interface ResultadoHorometro{
    numero_tractor: string | null;
    nombre_operador: string | null;
    codigo_labor: string | null;
    seccion: string | null;
    fecha : string | null;
    km_inicial: number | null;
    km_final: number | null;
    nombre_maquinaria: string | null;
    confianza: 'ALTA' | 'MEDIA' | 'BAJA';
    observaciones: string;
}

//Recibe un buffer de imagen de Multer y lo envia a Gemini para extraer la lectura
export async function analizarfotoHorometro(
    imagenBufer: Buffer,
    mimeType: string
): Promise<ResultadoHorometro>{
    try{

        const apiKey = process.env.GEMINI_API_KEY;
        if(!apiKey){
            throw new Error('No se encontro GEMINI_API_KEY en las variables de entorno.')
        }

        //Inicializamos la SDK de la API cargada en la variable de entorno dentro del SDK
        const ai = new GoogleGenAI({apiKey});

        //1. Convertir la imagen almacenada en RAM en base64 para Gemini
        const imagePart = {
            inlineData:{
                data: imagenBufer.toString('base64'),
                mimeType: mimeType,
            },
        };

        //2. Prompt calro y enfocado en Gemini
        const prompt = `
            Eres un sistema OCR de visión inteligencia artificial especializado en procesar "REPORTES DE LABORES MAQUINARIAS" manuscritos de FRUGALPCÍA LTDA.

            REGLAS DE EXTRACCIÓN Y LECTURA MANUSCRITA:
            - Omite números correlativos impresos en rojo.
            - Extrae la información escrita a mano por los operadores. La letra puede ser cursiva o difícil de leer.
            - Utiliza el contexto agrícola para inferir palabras borrosas (ej: "Fumigacion", "Cosecha", "Estroller", "Case", "Deutz", "Kubota", "Ferusol", "Ferguson", "John Deere", "Dumper").

            CAMPOS A EXTRAER:
            1. "nombre_maquinaria": Texto manuscrito en el campo 'Tractor:' o marca/tipo de la máquina (ej: "FERUSOL", "Ferguson", "Case", "Dumper", "Kubota"). Si está vacío, devuelve null.
            2. "numero_tractor": Texto/número en '# de Tractor:' o 'Equipo'. Si está escrito en palabras (ej: "DOS", "TRES"), conviértelo a número en texto ("02", "03"). Limpia símbolos de número (ej: "#15" -> "15").
            3. "nombre_operador": Nombre escrito en 'Operador:'.
            4. "fecha": Fecha del reporte formateada estrictamente como YYYY-MM-DD. Si solo ves día/mes/año (ej: 23/03/2026), conviértelo a YYYY-MM-DD.
            5. "codigo_labor": Descripción o código manuscrito de la labor realizada (ej: "Fumigacion", "Cosecha").
            6. "seccion": Valor manuscrito en 'Sección' (ej: "32c", "SCH3").
            7. "km_inicial": Número decimal de 'Horometro Inicio'.
            8. "km_final": Número decimal de 'Horometro Final'.

            Responde ÚNICAMENTE en JSON plano con la siguiente estructura:
            {
                "nombre_maquinaria": "FERUSOL",
                "numero_tractor": "15",
                "nombre_operador": "Cristian Moreira",
                "fecha": "2026-03-23",
                "codigo_labor": "Fumigacion",
                "seccion": "32c",
                "km_inicial": 3732.5,
                "km_final": 3743.6,
                "confianza": "ALTA",
                "observaciones": "Datos leídos correctamente"
            }
        `;

        //3.Llama al metodo con respuesta estructura en JSON
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash', //gemini-3.6-flash    o   gemini-3.5-flash(es más liviano y tiene menor tasa de saturación)
            contents: [prompt, imagePart],
            config: {
                responseMimeType: 'application/json',
            },
        });

        const respuestaTexto = response.text;

        if(!respuestaTexto){
            throw new Error('Gemini no devolvio ninguna respuesta.');
        };

        //4. Comvertir la respuesta de Gemini en un objeto JavaScript
        const resultado: ResultadoHorometro = JSON.parse(respuestaTexto);
        return resultado;

    } catch(error){
        console.error('❌ Error en el servidor de Gemini:', error);
        throw new Error('Error al procesar la imagen con la Inteligencia Artificial');
    }
}
