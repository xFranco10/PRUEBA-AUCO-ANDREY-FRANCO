import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Variables de entorno fijas para las pruebas: no dependen del .env de cada máquina
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://localhost:27017/test-no-se-usa',
      EXTERNAL_API_BASE_URL: 'https://nager.test/api/v3',
      EXTERNAL_API_TIMEOUT_MS: '5000',
      EXTERNAL_API_RETRIES: '1',
    },
    clearMocks: true,
  },
});
