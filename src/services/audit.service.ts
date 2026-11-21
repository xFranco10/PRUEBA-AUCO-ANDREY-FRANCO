import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient } from '../config/dynamo';
import { env } from '../config/env';

export interface AuditEventInput {
  validationId: string;
  document: string;
  country: string;
  createdAt: Date;
}

/**
 * Registra en DynamoDB el evento "se creó una validación".
 *
 * Llaves:
 *  - PK = documento: agrupa todos los eventos de una persona (consulta "¿qué pasó con esta cédula?").
 *  - SK = "<fecha ISO>#<validationId>": ordena cronológicamente (ISO 8601 en UTC ordena igual
 *    como texto) y el id evita que dos creaciones en el mismo milisegundo se pisen.
 *
 * No se guarda el nombre: es un dato personal que ya vive en Mongo y no aporta a la auditoría.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const createdAt = input.createdAt.toISOString();

  await dynamoDocClient.send(
    new PutCommand({
      TableName: env.DYNAMODB_TABLE,
      Item: {
        PK: input.document,
        SK: `${createdAt}#${input.validationId}`,
        eventType: 'VALIDATION_CREATED',
        document: input.document,
        validationId: input.validationId,
        country: input.country,
        createdAt,
      },
      // Red de seguridad: nunca sobrescribir un evento existente
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}
