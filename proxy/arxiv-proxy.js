// Cloudflare Worker - arXiv API CORS Proxy
// Deploy: npx wrangler deploy
// Free tier: 100,000 requests/day

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const params = url.searchParams.toString()
    if (!params) {
      return new Response('Missing query parameters', { status: 400 })
    }

    const arxivUrl = `https://export.arxiv.org/api/query?${params}`

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
