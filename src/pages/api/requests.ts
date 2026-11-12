import { getFeed } from '../../lib/content/repo';
import { jsonRoute } from '../../lib/http/json';

export const GET = jsonRoute('requests', getFeed);
