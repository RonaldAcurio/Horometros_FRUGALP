import dotenv from 'dotenv';
dotenv.config();

async function verificarModelos() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('❌ No se encontró GEMINI_API_KEY en el .env');
        return;
    }

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await res.json();
        
        if (data.error) {
            console.error('❌ Error de API:', data.error);
            return;
        }

        console.log('✅ MODELOS DISPONIBLES EN TU CUENTA:');
        const modelosProcesamiento = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name.replace('models/', ''));
        
        console.log(modelosProcesamiento);
    } catch (e) {
        console.error('❌ Error al conectar:', e);
    }
}

verificarModelos();