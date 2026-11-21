import { getCountryInfo } from '../clients/country.client';
import { InvalidIdError, NotFoundError } from '../errors/app-error';
import { ValidationModel } from '../models/validation.model';
import { describeError } from '../utils/describe-error';
import { recordAuditEvent } from './audit.service';
import { objectIdSchema, type CreateValidationInput } from '../schemas/validation.schema';

/**
 * Crea una validación: enriquece con la API externa y guarda en Mongo.
 * Si la API externa falla, lanza el error y no se guarda nada.
 * Devuelve el id del registro creado.
 */
export async function createValidation(input: CreateValidationInput): Promise<string> {
  const countryInfo = await getCountryInfo(input.country);

  const created = await ValidationModel.create({
    name: input.name,
    document: input.document,
    country: input.country,
    enrichment: {
      commonName: countryInfo.commonName,
      officialName: countryInfo.officialName,
      region: countryInfo.region,
      countryCode: countryInfo.countryCode,
    },
  });

  // La auditoría es secundaria: si DynamoDB falla se registra el error pero la validación
  // ya está guardada, así que no se rompe la respuesta 201.
  try {
    await recordAuditEvent({
      validationId: created.id,
      document: created.document,
      country: created.country,
      createdAt: created.createdAt,
    });
  } catch (error) {
    // Se loguea el id (no el documento) para no exponer datos personales en los logs
    console.error(
      `No se pudo escribir el evento de auditoría de la validación ${created.id}:`,
      describeError(error),
    );
  }

  return created.id;
}

/** Busca una validación por id. Lanza 400 si el id es inválido y 404 si no existe. */
export async function getValidationById(id: string) {
  if (!objectIdSchema.safeParse(id).success) {
    throw new InvalidIdError();
  }

  const found = await ValidationModel.findById(id);
  if (!found) {
    throw new NotFoundError('Validación no encontrada');
  }

  return found.toJSON();
}
