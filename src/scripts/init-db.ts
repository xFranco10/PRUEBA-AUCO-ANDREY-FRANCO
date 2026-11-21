import { ensureAuditTable } from '../config/dynamo';
import { env } from '../config/env';
import { describeError } from '../utils/describe-error';

// Crea la tabla de auditoría a mano: npm run db:init
// (la app también lo hace sola al arrancar, esto es solo por comodidad)
ensureAuditTable()
  .then((created) => {
    console.log(
      created
        ? `Tabla "${env.DYNAMODB_TABLE}" creada`
        : `La tabla "${env.DYNAMODB_TABLE}" ya existía`,
    );
  })
  .catch((error: unknown) => {
    console.error('No se pudo crear la tabla:', describeError(error));
    process.exit(1);
  });
