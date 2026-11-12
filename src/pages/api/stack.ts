import { listPublished } from '../../lib/content/repo';
import { stack } from '../../lib/content/public-api';
import { jsonRoute } from '../../lib/http/json';

export const GET = jsonRoute('api', async () => stack(await listPublished('experience')));
