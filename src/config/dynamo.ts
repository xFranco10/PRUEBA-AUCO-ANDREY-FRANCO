import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { env } from './env';

const client = new DynamoDBClient({
  region: env.AWS_REGION,
  // Solo se apunta a un endpoint propio (DynamoDB Local) si está configurado; si no, AWS real
  ...(env.DYNAMODB_ENDPOINT && { endpoint: env.DYNAMODB_ENDPOINT }),
  // Solo se pasan credenciales explícitas si existen; si no, el SDK usa su cadena por defecto (rol IAM)
  ...(env.AWS_ACCESS_KEY_ID &&
    env.AWS_SECRET_ACCESS_KEY && {
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    }),
  // La auditoría no debe colgar la petición si DynamoDB no responde: timeouts cortos y pocos intentos
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 2000, requestTimeout: 3000 },
});

/** Cliente "documento": permite trabajar con objetos JS en vez de tipos DynamoDB ({ S: '...' }). */
export const dynamoDocClient = DynamoDBDocumentClient.from(client);

/**
 * Crea la tabla de auditoría si no existe (operación idempotente).
 * Llaves: PK = documento, SK = fecha ISO + "#" + id de la validación.
 * Devuelve true si la tabla se creó en esta llamada.
 */
export async function ensureAuditTable(): Promise<boolean> {
  const TableName = env.DYNAMODB_TABLE;

  try {
    await client.send(new DescribeTableCommand({ TableName }));
    return false;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }

  try {
    await client.send(
      new CreateTableCommand({
        TableName,
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        // Pago por uso: no hay que dimensionar capacidad
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
  } catch (error) {
    // Otra instancia la creó justo ahora: no es un error
    if (!(error instanceof ResourceInUseException)) throw error;
  }

  // maxWaitTime y delays en segundos. maxWaitTime debe ser mayor que minDelay (20 s por defecto),
  // por eso se fija un minDelay corto para no esperar de más.
  await waitUntilTableExists({ client, maxWaitTime: 30, minDelay: 1, maxDelay: 2 }, { TableName });
  return true;
}
