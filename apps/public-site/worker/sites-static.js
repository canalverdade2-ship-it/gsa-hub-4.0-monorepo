/**
 * Cloudflare Worker entrypoint used only by the Sites deployment package.
 * The regular Vite build remains unchanged for the project's existing hosts.
 */
const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') return response;

    const accept = request.headers.get('accept') || '';
    if (!accept.includes('text/html')) return response;

    const fallbackUrl = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  },
};

export default worker;
