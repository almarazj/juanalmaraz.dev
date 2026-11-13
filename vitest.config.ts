import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    fileParallelism: false, // test files share one local DynamoDB table
    env: { AWS_ENDPOINT_URL_DYNAMODB: 'http://localhost:8000', AWS_ENDPOINT_URL_S3: 'http://localhost:9000' },
    testTimeout: 30_000, // first Shiki render loads grammars cold
  },
});
