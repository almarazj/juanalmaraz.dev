// Creates the local table and bucket in the Docker services. Safe to run repeatedly.
import { CreateTableCommand, DeleteTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { pathToFileURL } from 'node:url';

process.env.AWS_ENDPOINT_URL_DYNAMODB ??= 'http://localhost:8000';
process.env.AWS_ENDPOINT_URL_S3 ??= 'http://localhost:9000';
const { config, ddb, s3 } = await import('../src/lib/aws');

async function createTable() {
  try {
    await ddb().send(new CreateTableCommand({
      TableName: config().table,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
    }));
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err;
  }
}

async function createBucket() {
  const Bucket = config().bucket;
  try {
    await s3().send(new CreateBucketCommand({ Bucket }));
  } catch (err) {
    if (!(err instanceof Error) || !['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(err.name)) throw err;
  }
  // shortcut: the local server cannot match a port wildcard, so any origin may POST; fine for a throwaway local bucket.
  await s3().send(new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: { CORSRules: [{ AllowedMethods: ['POST'], AllowedOrigins: ['*'], AllowedHeaders: ['*'] }] },
  }));
}

export async function resetTable(): Promise<void> {
  await ddb().send(new DeleteTableCommand({ TableName: config().table })).catch(() => undefined);
  await createTable();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await Promise.all([createTable(), createBucket()]);
  console.log(`local table ${config().table} and bucket ${config().bucket} ready`);
}
