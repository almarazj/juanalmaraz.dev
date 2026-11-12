import { getSingleton } from '../../lib/content/repo';
import { me } from '../../lib/content/public-api';
import { jsonRoute } from '../../lib/http/json';

export const GET = jsonRoute('api', async () => me(await getSingleton('site/main')));
