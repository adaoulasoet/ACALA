const CLIENT_ID     = process.env.NETATMO_CLIENT_ID;
const CLIENT_SECRET = process.env.NETATMO_CLIENT_SECRET;
const REDIRECT_URI  = 'https://acaladu29.netlify.app';

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad Request' }) }; }

  const { action, code, access_token, refresh_token, home_id, setpoint_temp, mode } = body;

  try {
    // ── URL D'AUTORISATION
    if (action === 'get_auth_url') {
      const scope = 'read_thermostat write_thermostat';
      const url = `https://api.netatmo.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=code&state=netatmo`;
      return { statusCode: 200, headers, body: JSON.stringify({ url }) };
    }

    // ── ÉCHANGE CODE → TOKEN (OAuth2 Authorization Code)
    if (action === 'exchange') {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI
      });
      const r = await fetch('https://api.netatmo.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const text = await r.text();
      try {
        const d = JSON.parse(text);
        return { statusCode: r.status, headers, body: JSON.stringify(d) };
      } catch {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Netatmo response: ' + text.substring(0, 200) }) };
      }
    }

    // ── REFRESH TOKEN
    if (action === 'refresh') {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token
      });
      const r = await fetch('https://api.netatmo.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const d = await r.json();
      return { statusCode: r.status, headers, body: JSON.stringify(d) };
    }

    // ── STATUS
    if (action === 'status') {
      const r1 = await fetch('https://api.netatmo.com/api/homesdata', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const d1 = await r1.json();
      if (!r1.ok) return { statusCode: r1.status, headers, body: JSON.stringify(d1) };

      const homes = d1.body?.homes || [];
      const home = homes.find(h => h.modules?.some(m => m.type === 'NATherm1')) || homes[0];
      if (!home) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No thermostat found' }) };

      const r2 = await fetch(`https://api.netatmo.com/api/homestatus?home_id=${home.id}`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const d2 = await r2.json();
      if (!r2.ok) return { statusCode: r2.status, headers, body: JSON.stringify(d2) };

      const rooms = d2.body?.home?.rooms || [];
      const modules = d2.body?.home?.modules || [];
      const thermo = modules.find(m => m.type === 'NATherm1') || modules[0];
      const room = rooms.find(r => r.id === thermo?.room_id) || rooms[0];
      const thermoInfo = (home.modules || []).find(m => m.type === 'NATherm1') || {};

      return { statusCode: 200, headers, body: JSON.stringify({
        home_id: home.id, room_id: room?.id,
        temp: room?.therm_measured_temperature,
        setpoint: room?.therm_setpoint_temperature,
        mode: room?.therm_setpoint_mode,
        heating: thermo?.boiler_status,
        battery: thermo?.battery_state,
        name: thermoInfo.name || 'Thermostat'
      })};
    }

    // ── SETPOINT
    if (action === 'setpoint') {
      const r = await fetch('https://api.netatmo.com/api/setroomthermpoint', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_id, room_id: body.room_id, mode: 'manual', temp: setpoint_temp, endtime: Math.floor(Date.now() / 1000) + 3600 })
      });
      const d = await r.json();
      return { statusCode: r.status, headers, body: JSON.stringify(d) };
    }

    // ── MODE
    if (action === 'mode') {
      const r = await fetch('https://api.netatmo.com/api/setthermmode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_id, mode })
      });
      const d = await r.json();
      return { statusCode: r.status, headers, body: JSON.stringify(d) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
