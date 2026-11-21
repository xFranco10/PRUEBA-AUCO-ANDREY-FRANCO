# Respuestas de la entrega

## 1. Cómo usé la IA

Trabajé con Claude Code (el agente de IA de Anthropic, dentro de VS Code) como un compañero de equipo, y todo fue de mutuo acuerdo. Empecé redactando con él un plan por fases (estructura del backend, MongoDB, endpoints, DynamoDB, pruebas y documentación) y le pedí que, antes de escribir código, me hiciera preguntas para aclarar el contexto y ser más preciso; esas respuestas fijaron decisiones como usar un campo `country` para el enriquecimiento, validar la cédula colombiana como texto de 6 a 10 dígitos, permitir documentos repetidos, usar timeout de 5 s con un reintento (502/504 sin guardar nada) y tratar la auditoría como algo secundario (si falla se registra y se responde 201). Fuimos fase por fase y no avanzábamos sin mi aprobación; los commits los hice yo. Le pedí el código base, los endpoints, la integración con DynamoDB Local, las pruebas y la documentación, y tuve que corregir varias cosas: me propuso la API REST Countries v3.1, que ya estaba deprecada (lo vi en el navegador) y cuya v5 exige API key, así que migramos a Nager.Date verificando los endpoints reales con curl; la URL que me dio traía un marcador `{code}` que abrí sin código y respondió 404; sus primeras pruebas le pegaron a otro proyecto mío que ocupaba el puerto 3000; configuró mal el `waiter` de DynamoDB (un aviso falso al crear la tabla); los logs de error salían con el mensaje vacío; y una segunda revisión mostró que sus valores por defecto para las credenciales y el endpoint de AWS habrían pisado el rol IAM en producción, así que los hicimos opcionales. Por último, no di por buenas sus pruebas hasta romper el código a propósito y comprobar que fallaban.

## 2. Por qué elegí esas llaves en DynamoDB

La tabla `ValidationAudit` usa **`PK = número de documento`** y **`SK = fecha ISO en UTC + "#" + id de la validación`**, porque partí de la consulta que una auditoría necesita responder: _"¿qué ha pasado con este documento?"_. Con el documento como partition key, todos los eventos de una persona viven juntos y una sola `Query` los trae, sin `Scan`. La fecha va en la sort key porque el formato ISO 8601 en UTC ordena igual como texto que cronológicamente, así el historial sale en orden y también puedo pedir un rango de fechas (`between`) o los últimos eventos.

Le agregué el `#id` de la validación a la sort key para garantizar unicidad: si el mismo documento se crea dos veces en el mismo milisegundo, sin el id un evento pisaría al otro. Además el `PutItem` usa `attribute_not_exists(PK)` como red de seguridad, y el id enlaza cada evento con su registro en Mongo.

Descarté poner la fecha como partition key: todas las escrituras de un mismo día caerían en la misma partición (_hot partition_) y ya no podría buscar por documento. Tampoco guardé el nombre en el evento: es un dato personal que ya está en Mongo y duplicarlo solo amplía la exposición. La tabla usa `PAY_PER_REQUEST` para no tener que dimensionar capacidad.

## 3. Qué mejoraría con más tiempo

1. **Idempotencia:** hoy un reintento del cliente (por un timeout o un doble clic) crea dos registros y dos eventos. Soportaría un header `Idempotency-Key` para que repetir la misma petición no duplique.
2. **Consistencia Mongo + DynamoDB:** escribir en Mongo y luego en DynamoDB no es atómico; si DynamoDB falla queda un registro sin auditoría (hoy solo se loguea). Usaría el patrón _outbox_ o enviaría el evento a una cola (SQS/EventBridge) con reintentos y _dead-letter queue_.
3. **Documentación OpenAPI/Swagger** generada desde los mismos esquemas de zod, para que la documentación no se desincronice del código.
4. **Observabilidad:** logs estructurados (pino) con id de petición, métricas, y un `/health` que verifique de verdad Mongo, DynamoDB y la API externa (_readiness_).
5. **Resiliencia con la API externa:** cachear las respuestas por país (cambian muy poco) y agregar un _circuit breaker_ para no esperar 10 s por petición cuando la API está caída.
6. **Pruebas de integración** con Mongo y DynamoDB reales (Testcontainers) en CI, además de las unitarias con mocks; más un pipeline de GitHub Actions con lint, tipos y tests, y un `Dockerfile` para la app.
7. **Seguridad y datos personales:** autenticación, _rate limiting_, `helmet`, y enmascarar o cifrar el número de documento en la auditoría y los logs.
8. **Un endpoint de consulta del historial** (`GET /validations?document=...` o directamente desde la auditoría), con paginación.
