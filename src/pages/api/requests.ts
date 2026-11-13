import { getFeed } from '../../lib/feed/store';
import { jsonRoute } from '../../lib/http/json';

export const GET = jsonRoute('requests', () => getFeed());
