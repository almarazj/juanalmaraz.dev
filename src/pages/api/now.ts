import { getSingleton } from '../../lib/content/repo';
import { jsonRoute } from '../../lib/http/json';

export const GET = jsonRoute('api', async () => (await getSingleton('site/main')).now);
