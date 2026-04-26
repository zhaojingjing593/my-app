exports.handler = async (event) => {
  const qs = event.rawQuery ? `?${event.rawQuery}` : ''
  try {
    const res = await fetch(`https://export.arxiv.org/api/query${qs}`)
    const text = await res.text()
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: text,
    }
  } catch (err) {
    return { statusCode: 502, body: `Upstream error: ${err.message}` }
  }
}
