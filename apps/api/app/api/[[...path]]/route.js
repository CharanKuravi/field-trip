import { dispatch } from '../../../lib/router.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = (req, ctx) => dispatch(req, ctx);
export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as OPTIONS };
