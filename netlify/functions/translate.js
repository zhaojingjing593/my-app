exports.handler = async (event) => {
  const qs = event.rawQuery ? `?${event.rawQuery}` : ''
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single${qs}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const data = await res.json()
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) }
  }
}
