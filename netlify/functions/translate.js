// Translation API proxies — most removed, DeepSeek is called directly from the client
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ message: 'Translation proxies no longer needed. DeepSeek is used directly.' }),
})