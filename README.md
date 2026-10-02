# cure.math AI

Tutor interactivo de Cálculo 1 con calculadora, graficador local, KaTeX, sesión anónima por dispositivo y presencia en tiempo real.

## Desarrollo local

```bash
npm install
npm test
npm start
```

Abre `http://localhost:3000`. El graficador usa `frontend/math-worker.js` y no necesita una clave de IA.

## Variables de entorno

Duplica `.env.example` como `.env` y configura solo el proveedor que quieras usar:

- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`: proveedor compatible con Chat Completions, incluido OpenAI.
- `HF_API_TOKEN`, `HF_MODEL`: Hugging Face Inference; el token se queda en el servidor.
- `OLLAMA_URL`, `OLLAMA_MODEL`: servidor Ollama externo o local.
- `ALLOWED_ORIGINS`: orígenes HTTPS separados por coma.

Hugging Face no debe llamarse desde el navegador con el token expuesto. Si no hay proveedor configurado, el backend activa la guía curricular local.

## Render

1. Conecta el repositorio en Render como Web Service.
2. Usa `backend` como `Root Directory`.
3. Usa `npm install` como Build Command y `npm start` como Start Command.
4. Configura las variables de entorno y define `ALLOWED_ORIGINS` con el dominio público.
5. Haz un deploy y verifica `/health` y `/api/app-meta`.

## Cloudflare Pages opcional

Si separas el frontend, publica `frontend/`, conserva `frontend/_headers` y cambia la constante de API en el cliente para apuntar al backend Render. El backend debe incluir el dominio de Cloudflare en `ALLOWED_ORIGINS`.

## Seguridad

No coloques claves en `frontend/`, `localStorage`, GitHub ni en mensajes del navegador. La sesión por dispositivo es anónima y en memoria; para persistencia multi-instancia usa una base de datos administrada.
