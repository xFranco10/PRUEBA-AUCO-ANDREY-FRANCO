import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { getCountryInfo } from '../src/clients/country.client';
import {
  CountryNotFoundError,
  ExternalApiError,
  ExternalApiTimeoutError,
} from '../src/errors/app-error';
import { ValidationModel } from '../src/models/validation.model';
import { recordAuditEvent } from '../src/services/audit.service';

// Se mockean las tres dependencias externas: la API pública, Mongo y DynamoDB.
// Así las pruebas corren sin Docker, sin base de datos y sin internet.
vi.mock('../src/clients/country.client');
vi.mock('../src/services/audit.service');
vi.mock('../src/models/validation.model', () => ({
  ValidationModel: { create: vi.fn(), findById: vi.fn() },
}));

const mockedGetCountryInfo = vi.mocked(getCountryInfo);
const mockedRecordAudit = vi.mocked(recordAuditEvent);
const mockedCreate = vi.mocked(ValidationModel.create);
const mockedFindById = vi.mocked(ValidationModel.findById);

const app = createApp();

const SAVED_ID = '6b00cce19c47e0d550f7e8af';
const validBody = { name: 'María José Pérez', document: '1088123456', country: 'CO' };

const colombia = {
  commonName: 'Colombia',
  officialName: 'Republic of Colombia',
  region: 'Americas',
  countryCode: 'CO',
};

describe('POST /validations', () => {
  beforeEach(() => {
    mockedGetCountryInfo.mockResolvedValue(colombia);
    mockedRecordAudit.mockResolvedValue(undefined);
    mockedCreate.mockResolvedValue({
      id: SAVED_ID,
      document: validBody.document,
      country: 'CO',
      createdAt: new Date('2026-11-21T15:00:00.000Z'),
    } as never);
  });

  it('crea la validación, enriquece con la API externa, audita y responde 201 con el id', async () => {
    const res = await request(app).post('/validations').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: SAVED_ID });

    expect(mockedGetCountryInfo).toHaveBeenCalledWith('CO');
    expect(mockedCreate).toHaveBeenCalledWith({
      name: 'María José Pérez',
      document: '1088123456',
      country: 'CO',
      enrichment: colombia,
    });
    expect(mockedRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ validationId: SAVED_ID, document: '1088123456', country: 'CO' }),
    );
  });

  it('normaliza la entrada: recorta el nombre y pasa el país a mayúsculas', async () => {
    await request(app)
      .post('/validations')
      .send({ ...validBody, name: '  Ana Pérez  ', country: 'co' });

    expect(mockedGetCountryInfo).toHaveBeenCalledWith('CO');
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ana Pérez', country: 'CO' }),
    );
  });

  it.each([
    ['documento demasiado corto', { ...validBody, document: '123' }, 'document'],
    ['documento con letras', { ...validBody, document: '12ab5678' }, 'document'],
    ['documento enviado como número', { ...validBody, document: 1088123456 }, 'document'],
    ['nombre con dígitos', { ...validBody, name: 'R2D2' }, 'name'],
    ['país de 3 letras', { ...validBody, country: 'COL' }, 'country'],
    ['campos faltantes', {}, 'name'],
  ])('responde 400 y no llama a nada externo: %s', async (_caso, body, field) => {
    const res = await request(app).post('/validations').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);

    expect(mockedGetCountryInfo).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('responde 400 INVALID_JSON si el cuerpo no es JSON válido', async () => {
    const res = await request(app)
      .post('/validations')
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('responde 422 COUNTRY_NOT_FOUND si la API externa no conoce el país', async () => {
    mockedGetCountryInfo.mockRejectedValue(new CountryNotFoundError('ZZ'));

    const res = await request(app)
      .post('/validations')
      .send({ ...validBody, country: 'ZZ' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUNTRY_NOT_FOUND');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['falla (5xx)', new ExternalApiError('La API externa respondió con estado 500', true), 502],
    ['no responde a tiempo', new ExternalApiTimeoutError(5000), 504],
  ])('si la API externa %s responde %i y NO guarda nada', async (_caso, error, status) => {
    mockedGetCountryInfo.mockRejectedValue(error);

    const res = await request(app).post('/validations').send(validBody);

    expect(res.status).toBe(status);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedRecordAudit).not.toHaveBeenCalled();
  });

  it('si falla la auditoría en DynamoDB igual responde 201 (la auditoría es secundaria)', async () => {
    mockedRecordAudit.mockRejectedValue(new Error('DynamoDB caído'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/validations').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: SAVED_ID });
    // El error se registra en el log, pero sin exponer el número de documento
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(validBody.document);
  });
});

describe('GET /validations/:id', () => {
  it('devuelve 200 con el registro guardado', async () => {
    const record = { id: SAVED_ID, ...validBody, country: 'CO', enrichment: colombia };
    mockedFindById.mockResolvedValue({ toJSON: () => record } as never);

    const res = await request(app).get(`/validations/${SAVED_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(mockedFindById).toHaveBeenCalledWith(SAVED_ID);
  });

  it('devuelve 404 NOT_FOUND si no existe', async () => {
    mockedFindById.mockResolvedValue(null);

    const res = await request(app).get('/validations/aaaaaaaaaaaaaaaaaaaaaaaa');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('devuelve 400 INVALID_ID si el id no es un ObjectId y no consulta la base', async () => {
    const res = await request(app).get('/validations/abc');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
    expect(mockedFindById).not.toHaveBeenCalled();
  });
});

describe('rutas desconocidas', () => {
  it('devuelve 404 con el formato de error estándar', async () => {
    const res = await request(app).get('/no-existe');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
