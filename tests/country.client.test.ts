import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCountryInfo } from '../src/clients/country.client';
import {
  CountryNotFoundError,
  ExternalApiError,
  ExternalApiTimeoutError,
} from '../src/errors/app-error';

// En vitest.config.ts: EXTERNAL_API_RETRIES=1, es decir, hasta 2 intentos en total.

const colombia = {
  commonName: 'Colombia',
  officialName: 'Republic of Colombia',
  region: 'Americas',
  countryCode: 'CO',
  // Campo extra que la API devuelve y que no nos interesa
  borders: [],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getCountryInfo', () => {
  it('devuelve solo los campos esperados y llama a la URL correcta', async () => {
    fetchMock.mockResolvedValue(jsonResponse(colombia));

    const result = await getCountryInfo('CO');

    expect(result).toEqual({
      commonName: 'Colombia',
      officialName: 'Republic of Colombia',
      region: 'Americas',
      countryCode: 'CO',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://nager.test/api/v3/CountryInfo/CO');
  });

  it('reintenta una vez si la API responde 5xx y tiene éxito en el segundo intento', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(colombia));

    const result = await getCountryInfo('CO');

    expect(result.commonName).toBe('Colombia');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si el 5xx persiste lanza ExternalApiError (502) tras agotar los intentos', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, 500));

    await expect(getCountryInfo('CO')).rejects.toMatchObject({
      statusCode: 502,
      code: 'EXTERNAL_API_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lanza ExternalApiTimeoutError (504) si se agota el tiempo, tras reintentar', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    fetchMock.mockRejectedValue(timeout);

    const error = await getCountryInfo('CO').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiTimeoutError);
    expect(error).toMatchObject({ statusCode: 504, code: 'EXTERNAL_API_TIMEOUT' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reintenta ante errores de red y lanza ExternalApiError si persisten', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(getCountryInfo('CO')).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta si el país no existe (404) y lanza CountryNotFoundError (422)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    const error = await getCountryInfo('ZZ').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CountryNotFoundError);
    expect(error).toMatchObject({ statusCode: 422, code: 'COUNTRY_NOT_FOUND' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('NO reintenta un 4xx distinto de 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 400));

    await expect(getCountryInfo('CO')).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza una respuesta con formato inesperado y no la reintenta', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ foo: 'bar' }));

    await expect(getCountryInfo('CO')).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
