import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

type Env = Record<string, string | undefined>;
export interface AwsConfig { region: string; table: string; bucket: string; local: boolean }

export function resolveAwsConfig(env: Env): AwsConfig {
  const region = env.AWS_REGION ?? 'us-east-2';
  if (env.AWS_ENDPOINT_URL_DYNAMODB) {
    return {
      region,
      table: env.TABLE_NAME ?? 'juanalmaraz-site-local',
      bucket: env.MEDIA_BUCKET ?? 'juanalmaraz-media-local',
      local: true,
    };
  }
  const { TABLE_NAME: table, MEDIA_BUCKET: bucket } = env;
  if (!table || !bucket) throw new Error('TABLE_NAME and MEDIA_BUCKET must be set outside local services');
  return { region, table, bucket, local: false };
}

let cfg: AwsConfig | undefined;
export const config = (): AwsConfig => (cfg ??= resolveAwsConfig(process.env));

// Local services ignore credentials, but the SDK still insists on some.
const localCredentials = { accessKeyId: 'local', secretAccessKey: 'local' };
const clientOptions = () => {
  const { region, local } = config();
  return { region, ...(local ? { credentials: localCredentials } : {}) };
};

let docClient: DynamoDBDocumentClient | undefined;
export function ddb(): DynamoDBDocumentClient {
  // zod keeps optional keys as undefined, which DynamoDB would otherwise reject.
  return (docClient ??= DynamoDBDocumentClient.from(new DynamoDBClient(clientOptions()), {
    marshallOptions: { removeUndefinedValues: true },
  }));
}

let s3Client: S3Client | undefined;
export const s3 = (): S3Client => (s3Client ??= new S3Client({ ...clientOptions(), forcePathStyle: config().local }));

export type SecretName = 'session-key' | 'cognito-client-secret';

export function createSecretStore(fetch: (name: SecretName) => Promise<string>) {
  const cache = new Map<SecretName, Promise<string>>();
  return (name: SecretName): Promise<string> => {
    let value = cache.get(name);
    if (!value) {
      value = fetch(name).then((v) => {
        if (!v) throw new Error(`Missing secret ${name}`);
        return v;
      });
      cache.set(name, value);
      // A failed fetch must not stick for the life of the process.
      value.catch(() => cache.delete(name));
    }
    return value;
  };
}

const localSecrets: Record<SecretName, string> = {
  'session-key': 'SESSION_KEY',
  'cognito-client-secret': 'COGNITO_CLIENT_SECRET',
};

export const secret = createSecretStore(async (name) => {
  if (config().local) return process.env[localSecrets[name]] ?? '';
  const out = await new SSMClient(clientOptions()).send(
    new GetParameterCommand({ Name: `/juanalmaraz/${name}`, WithDecryption: true }),
  );
  return out.Parameter?.Value ?? '';
});
