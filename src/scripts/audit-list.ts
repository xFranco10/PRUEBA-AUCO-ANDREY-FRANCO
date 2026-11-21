import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient } from '../config/dynamo';
import { env } from '../config/env';
import { describeError } from '../utils/describe-error';

// Herramienta de desarrollo para ver los eventos de auditoría guardados en DynamoDB.
//
// Uso:
//   npm run audit:list                       -> todos los eventos
//   npm run audit:list -- 1088123456         -> eventos de un documento
//   npm run audit:list -- --watch            -> imprime cada evento nuevo en cuanto se escribe
//   npm run audit:list -- 1088123456 -w      -> lo mismo, filtrado por documento

interface AuditItem {
  PK: string;
  SK: string;
  eventType: string;
  document: string;
  validationId: string;
  country: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 2000;

const args = process.argv.slice(2);
const watch = args.includes('--watch') || args.includes('-w');
const document = args.find((arg) => !arg.startsWith('-'));

if (document && !/^\d{6,10}$/.test(document)) {
  console.error('El documento debe contener solo dígitos (entre 6 y 10).');
  process.exit(1);
}

/** Trae todos los eventos (con paginación). Con documento usa Query; sin él, Scan. */
async function fetchEvents(): Promise<AuditItem[]> {
  const items: AuditItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const page = document
      ? await dynamoDocClient.send(
          new QueryCommand({
            TableName: env.DYNAMODB_TABLE,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': document },
            ExclusiveStartKey: lastKey,
          }),
        )
      : // Scan recorre toda la tabla: aceptable en esta herramienta de desarrollo, no en producción
        await dynamoDocClient.send(
          new ScanCommand({ TableName: env.DYNAMODB_TABLE, ExclusiveStartKey: lastKey }),
        );

    items.push(...(page.Items as AuditItem[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  // Orden cronológico (el Scan no garantiza orden; el Query ya viene ordenado por SK)
  return items.sort((a, b) => a.SK.localeCompare(b.SK));
}

const keyOf = (item: AuditItem) => `${item.PK}|${item.SK}`;

function formatEvent(item: AuditItem): string {
  return `${item.createdAt}  ${item.eventType}  documento=${item.document}  país=${item.country}  validationId=${item.validationId}`;
}

async function main(): Promise<void> {
  const scope = document ? `documento ${document}` : 'todos los documentos';
  const events = await fetchEvents();

  console.log(`Tabla "${env.DYNAMODB_TABLE}" · ${scope} · ${events.length} evento(s)`);
  if (events.length > 0) {
    console.table(
      events.map((item) => ({
        fecha: item.createdAt,
        evento: item.eventType,
        documento: item.document,
        país: item.country,
        validationId: item.validationId,
      })),
    );
  }

  if (!watch) return;

  console.log(
    `\nEsperando eventos nuevos (cada ${POLL_INTERVAL_MS / 1000} s). Ctrl+C para salir.\n`,
  );
  const seen = new Set(events.map(keyOf));

  setInterval(() => {
    fetchEvents()
      .then((current) => {
        for (const item of current) {
          if (!seen.has(keyOf(item))) {
            seen.add(keyOf(item));
            console.log(`+ ${formatEvent(item)}`);
          }
        }
      })
      // En modo vigilancia un fallo puntual no debe cortar el proceso
      .catch((error: unknown) =>
        console.warn('No se pudo consultar DynamoDB:', describeError(error)),
      );
  }, POLL_INTERVAL_MS);

  process.on('SIGINT', () => process.exit(0));
}

main().catch((error: unknown) => {
  console.error('No se pudo consultar la auditoría:', describeError(error));
  process.exit(1);
});
