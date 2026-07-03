exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-linky-token', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
  }

  const token = process.env.LINKY_TOKEN || event.headers['x-linky-token'];
  if (!token) return { statusCode: 401, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Token manquant' }) };

  // Extraire le PRM depuis le payload JWT
  let prm = '';
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    prm = Array.isArray(payload.sub) ? payload.sub[0] : payload.sub;
  } catch(e) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Token JWT invalide' }) };
  }

  const path  = event.queryStringParameters?.path  || 'daily_consumption';
  const start = event.queryStringParameters?.start || '';
  const end   = event.queryStringParameters?.end   || '';
  const url   = `https://conso.boris.sh/api/${path}?prm=${prm}&start=${start}&end=${end}`;

  try {
    const r = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'ACALA-SARL-famille/1.0'
      }
    });
    const body = await r.text();
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body };
  } catch(e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
