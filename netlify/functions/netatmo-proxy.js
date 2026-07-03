// Proxy Netatmo API — gestion OAuth2 et appels API
const NETATMO_CLIENT_ID     = process.env.NETATMO_CLIENT_ID;
const NETATMO_CLIENT_SECRET = process.env.NETATMO_CLIENT_SECRET;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Vérifier que les variables d'env sont présentes
  if (!NETATMO_CLIENT_ID || !NETATMO_CLIENT_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ 
      error: 'Variables manquantes',
      has_client_id: !!NETATMO_CLIENT_ID,
      has_client_secret: !!NETATMO_CLIENT_SECRET
    })};
  }

  let body;
  try { body = JSON.parse(event.body); } 
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad Request' }) }; }

  const { action, access_token, refresh_token, username, password, home_id, setpoint_temp, mode } = body;

  try {
    if (action === 'login') {
      const params = new URLSearchParams({
        grant_type: 'password',
        client_id: NETATMO_CLIENT_ID,
        client_secret: NETATMO_CLIENT_SECRET,
        username,
        password,
        scope: 'read_thermostat write_thermostat'
      });
      const r = await fetch('https://api.netatmo.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const d = await r.json();
      return { statusCode: r.status, headers, body: JSON.stringify(d) };
    }

    if (action === 'refresh') {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: NETATMO_CLIENT_ID,
        client_secret: NETATMO_CLIENT_SECRET,
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
      const homeModules = home.modules || [];
      const thermoInfo = homeModules.find(m => m.type === 'NATherm1') || {};

      return { statusCode: 200, headers, body: JSON.stringify({
        home_id: home.id,
        room_id: room?.id,
        temp: room?.therm_measured_temperature,
        setpoint: room?.therm_setpoint_temperature,
        mode: room?.therm_setpoint_mode,
        heating: thermo?.boiler_status,
        battery: thermo?.battery_state,
        name: thermoInfo.name || 'Thermostat'
      })};
    }

    if (action === 'setpoint') {
      const r = await fetch('https://api.netatmo.com/api/setroomthermpoint', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home_id, room_id: body.room_id, mode: 'manual',
          temp: setpoint_temp, endtime: Math.floor(Date.now() / 1000) + 3600
        })
      });
      const d = await r.json();
      return { statusCode: r.status, headers, body: JSON.stringify(d) };
    }

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
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, stack: err.stack }) };
  }
};
