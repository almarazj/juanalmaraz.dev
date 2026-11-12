import { listPublished } from '../../lib/content/repo';
import { experience } from '../../lib/content/public-api';
import { jsonRoute } from '../../lib/http/json';

export const GET = jsonRoute('api', async () => experience(await listPublished('experience')));
