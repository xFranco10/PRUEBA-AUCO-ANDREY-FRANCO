# Servicio de validaciones

Servicio en Node.js (Express 5 + TypeScript) que recibe un nombre, un número de documento y un país, **enriquece el registro con una API pública gratuita**, lo guarda en **MongoDB** y escribe un **evento de auditoría en DynamoDB Local**.

```
POST /validations
  1. valida la entrada (zod)
  2. consulta la API pública (Nager.Date): timeout 5 s, 1 reintento
  3. guarda en MongoDB
  4. escribe el evento de auditoría en DynamoDB
  5. responde 201 { "id": "..." }
```

| Pieza          | Tecnología                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Servidor       | Node.js 20+ (probado en 24), Express 5, TypeScript                          |
| Validación     | zod (entradas y variables de entorno)                                       |
| Base principal | MongoDB + Mongoose                                                          |
| Auditoría      | DynamoDB Local (AWS SDK v3)                                                 |
| API externa    | [Nager.Date](https://date.nager.at) `CountryInfo`, gratis y **sin API key** |
| Pruebas        | Vitest + Supertest                                                          |

## Requisitos

- Node.js 20 o superior y npm
- Docker (Docker Desktop en Windows/Mac) para levantar MongoDB y DynamoDB Local
- Conexión a internet (para la API pública al correr el servicio; los tests **no** la necesitan)

## Cómo correrlo

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de variables de entorno (los valores por defecto sirven tal cual)
cp .env.example .env            # en PowerShell: Copy-Item .env.example .env

# 3. Levantar MongoDB y DynamoDB Local
docker compose up -d

# 4. Arrancar el servicio en modo desarrollo
npm run dev
```

El servicio queda en **http://localhost:3000**. Al arrancar crea solo la tabla de auditoría en DynamoDB; si quieres crearla a mano: `npm run db:init`.

### ¿Ya tienes un MongoDB local en el puerto 27017?

El contenedor de Mongo también usa el 27017 por defecto y chocaría. Tienes dos opciones:

- **Usar tu Mongo y levantar solo DynamoDB:** `docker compose up -d dynamodb` (el `.env.example` ya apunta a `mongodb://localhost:27017`).
- **Usar el contenedor en otro puerto:** `MONGO_PORT=27018 docker compose up -d` y poner `MONGO_URI=mongodb://localhost:27018` en el `.env`.

### Producción

```bash
npm run build     # compila a dist/
npm start         # node dist/server.js
```

## Variables de entorno

Todas se validan al arrancar con zod; si alguna es inválida el servicio no inicia y dice cuál.

| Variable                                      | Por defecto                    | Descripción                                                                                                                   |
| --------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                    | `development`                  | `development`, `test` o `production`                                                                                          |
| `PORT`                                        | `3000`                         | Puerto HTTP                                                                                                                   |
| `MONGO_URI`                                   | — (**requerida**)              | Cadena de conexión a MongoDB                                                                                                  |
| `MONGO_DB_NAME`                               | `auco_validations`             | Base de datos                                                                                                                 |
| `EXTERNAL_API_BASE_URL`                       | `https://date.nager.at/api/v3` | API pública de enriquecimiento                                                                                                |
| `EXTERNAL_API_TIMEOUT_MS`                     | `5000`                         | Timeout por intento                                                                                                           |
| `EXTERNAL_API_RETRIES`                        | `1`                            | Reintentos (0 a 3) ante fallas transitorias                                                                                   |
| `AWS_REGION`                                  | `us-east-1`                    | Región de DynamoDB                                                                                                            |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | opcionales                     | Credenciales ficticias en local (`local`/`local`). **En AWS real se dejan vacías** y se usa el rol IAM. Van juntas o ninguna. |
| `DYNAMODB_ENDPOINT`                           | opcional                       | `http://localhost:8000` para DynamoDB Local. **Vacío = AWS real.**                                                            |
| `DYNAMODB_TABLE`                              | `ValidationAudit`              | Nombre de la tabla de auditoría                                                                                               |

## Endpoints

### `POST /validations`

Crea una validación.

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana Perez","document":"1088123456","country":"CO"}'
```

| Campo      | Regla                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`     | Obligatorio. 2 a 100 caracteres: letras (con tildes y ñ), espacios, guion y apóstrofe. Se recorta.                |
| `document` | Obligatorio. **String** de 6 a 10 dígitos (cédula colombiana). Debe ir como texto para no perder ceros iniciales. |
| `country`  | Obligatorio. Código ISO de 2 letras (`CO`, `US`...). Se normaliza a mayúsculas.                                   |

Respuesta `201`:

```json
{ "id": "6b01b5f713310937801f2648" }
```

### `GET /validations/:id`

Devuelve el registro guardado.

```bash
curl http://localhost:3000/validations/6b01b5f713310937801f2648
```

Respuesta `200`:

```json
{
  "id": "6b01b5f713310937801f2648",
  "name": "Ana Perez",
  "document": "1088123456",
  "country": "CO",
  "enrichment": {
    "commonName": "Colombia",
    "officialName": "Republic of Colombia",
    "region": "Americas",
    "countryCode": "CO"
  },
  "createdAt": "2026-11-21T15:17:11.308Z",
  "updatedAt": "2026-11-21T15:17:11.308Z"
}
```

Lo enviado por el usuario (`name`, `document`, `country`) queda separado de lo que aportó la API externa (`enrichment`).

### `GET /health`

Devuelve `{ "status": "ok", "uptime": ... }` para saber que el servicio está arriba.

### Formato de errores

Todos los errores tienen la misma forma:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": [{ "field": "document", "message": "..." }]
  }
}
```

| HTTP | `code`                 | Cuándo                                                                  |
| ---- | ---------------------- | ----------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`     | El body no cumple las reglas (`details` indica el campo)                |
| 400  | `INVALID_JSON`         | El body no es JSON válido                                               |
| 400  | `INVALID_ID`           | El `:id` no es un ObjectId válido                                       |
| 404  | `NOT_FOUND`            | La validación o la ruta no existe                                       |
| 413  | `PAYLOAD_TOO_LARGE`    | Body demasiado grande                                                   |
| 422  | `COUNTRY_NOT_FOUND`    | El código tiene formato válido pero la API externa no conoce el país    |
| 502  | `EXTERNAL_API_ERROR`   | La API externa falló (5xx, red, respuesta inesperada) tras el reintento |
| 504  | `EXTERNAL_API_TIMEOUT` | La API externa no respondió a tiempo en ningún intento                  |
| 500  | `INTERNAL_ERROR`       | Error inesperado (el detalle solo va al log, no al cliente)             |

> En los errores 422, 502 y 504 **no se guarda nada** en MongoDB ni en DynamoDB.

### Manejo de la API externa

- Cada llamada tiene **timeout de 5 s** y se reintenta **una vez**, solo ante fallas transitorias: timeout, error de red, 5xx o 429.
- **No se reintenta** un 404 (el país no existe), otro 4xx ni una respuesta con formato inesperado: repetirlo no cambia el resultado.
- La respuesta se **valida con zod** antes de usarla, para que un cambio en esa API no meta datos basura en Mongo.

## Auditoría en DynamoDB

Cada creación escribe un evento `VALIDATION_CREATED` en la tabla `ValidationAudit`:

| Atributo                                           | Ejemplo                                | Rol                                                    |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `PK`                                               | `1088123456`                           | Partition key = número de documento                    |
| `SK`                                               | `2026-11-21T15:17:11.308Z#6b01b5f7...` | Sort key = fecha ISO (UTC) + `#` + id de la validación |
| `eventType`                                        | `VALIDATION_CREATED`                   | Tipo de evento                                         |
| `validationId`, `country`, `document`, `createdAt` |                                        | Datos del evento                                       |

No se guarda el nombre: es un dato personal que ya vive en Mongo.

- Con `PK = documento` una sola `Query` trae todo el historial de una persona, y la fecha en la `SK` lo devuelve en orden cronológico (y permite filtrar por rango de fechas).
- El `#id` al final evita que dos creaciones del mismo documento en el mismo milisegundo se pisen. Además el `PutItem` usa `attribute_not_exists(PK)` como red de seguridad.
- **Si la escritura de auditoría falla**, se registra el error en el log (con el id, nunca el documento) y la respuesta sigue siendo `201`: la validación ya está guardada y la auditoría es secundaria.

### Ver la auditoría

```bash
npm run audit:list                          # todos los eventos
npm run audit:list -- 1088123456            # eventos de un documento
npm run audit:list -- --watch               # imprime cada evento nuevo en cuanto se escribe
```

Útil para dejarlo en una terminal mientras insertas desde otra. (Sin documento usa un `Scan`: es una herramienta de desarrollo.)

## Pruebas

```bash
npm test             # corre todo una vez
npm run test:watch   # modo observación
```

25 pruebas en 2 archivos, que **no necesitan Docker, base de datos ni internet** (mockean la API externa, Mongo y DynamoDB):

- `tests/validations.routes.test.ts`: los endpoints completos con Supertest. Éxito, normalización, entradas inválidas, JSON roto, país inexistente (422), API externa caída o lenta (502/504 sin guardar), falla de auditoría que no rompe el 201, y `GET` (200, 404, 400).
- `tests/country.client.test.ts`: la política de reintentos del cliente de la API externa.

## Scripts

| Comando                           | Qué hace                               |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | Servidor con recarga automática        |
| `npm run build` / `npm start`     | Compila a `dist/` y lo ejecuta         |
| `npm test` / `npm run test:watch` | Pruebas                                |
| `npm run lint` / `npm run format` | ESLint / Prettier                      |
| `npm run typecheck`               | Verifica tipos sin compilar            |
| `npm run db:init`                 | Crea la tabla de auditoría en DynamoDB |
| `npm run audit:list`              | Muestra los eventos de auditoría       |

## Estructura

```
src/
├── config/        env (zod), conexión a Mongo, cliente DynamoDB y creación de tabla
├── clients/       cliente de la API externa (timeout, reintentos, validación)
├── routes/        definición de rutas
├── controllers/   capa HTTP (req/res)
├── services/      lógica de negocio: validaciones y auditoría
├── models/        modelo Mongoose
├── schemas/       esquemas zod de entrada
├── middlewares/   validación, 404 y manejador central de errores
├── errors/        errores de dominio con código HTTP
├── utils/         utilidades
├── scripts/       db:init y audit:list
├── app.ts         fábrica de la app (la usan los tests)
└── server.ts      arranque y cierre ordenado
tests/             pruebas automatizadas
docker-compose.yml MongoDB + DynamoDB Local
```

## Decisiones de diseño

- **Se permiten documentos repetidos.** Cada `POST` es un _evento de validación_, no un perfil de persona; la misma cédula puede validarse varias veces. Es coherente con la auditoría, cuya llave (documento + fecha) presupone varios eventos por documento.
- **API pública: Nager.Date y no REST Countries.** REST Countries retiró sus versiones v1 a v4 y la v5 exige API key, lo que obliga a quien evalúe a registrarse. Nager.Date es gratis, sin key, y responde un 404 limpio para países inexistentes.
- **La auditoría es secundaria**: si DynamoDB falla, el registro principal ya está en Mongo y se responde `201`. Las llamadas a DynamoDB tienen timeouts cortos (2 s conexión, 3 s respuesta) para no colgar la petición.
- **DynamoDB opcional en la configuración**: `DYNAMODB_ENDPOINT` y las credenciales no tienen valor por defecto, de modo que en AWS real el SDK usa el rol IAM en lugar de unas credenciales falsas.
- **Los datos personales no van a los logs**: los errores de auditoría registran el id de la validación, no el documento.

Las respuestas a las preguntas de la prueba (uso de IA, elección de llaves y mejoras) están en [ENTREGA.md](ENTREGA.md).
