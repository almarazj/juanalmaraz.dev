import type { APIRoute } from 'astro';
import { json } from '../../lib/http/json';
import { checkServices } from '../../lib/status/check';
import { liveDeps } from '../../lib/status/deps';

export const GET: APIRoute = async () => json(await checkServices(liveDeps()), 'status');
