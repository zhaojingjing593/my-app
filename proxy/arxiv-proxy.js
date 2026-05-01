// Cloudflare Worker - arXiv API Proxy
// Deploy to Cloudflare Workers (free tier: 100k requests/day)
// 1. Go to https://workers.cloudflare.com
// 2. Create a new Worker
// 3. Copy-paste this entire file
// 4. Deploy and copy the worker URL (e.g. https://arxiv-proxy.yourname.workers.dev)
// 5. Paste the URL in the arXiv Recommender settings page

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const query = url.searchParams.get('query')
    if (!query) {
      return new Response('Missing query parameter', { status: 400 })
    }

    const arxivUrl = `https://export.arxiv.org/api/query?${query}&start=0&max_results=${url.searchParams.get('max_results') || '10'}&sortBy=submittedDate&sortOrder=descending`

    const res = await fetch(arxivUrl, {
      headers: { 'User-Agent': 'arXiv-Recommender/1.0' },
    })

    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET')

    return new Response(res.body, {
      status: res.status,
      headers,
    })
  },
}
