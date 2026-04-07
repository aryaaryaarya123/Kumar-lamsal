import https from 'https';

const options = {
  hostname: 'www.nepalstock.com.np',
  path: '/api/authenticate/historical-data?symbol=NTC&from=2025-01-01&to=2026-04-07',
  method: 'GET',
  rejectUnauthorized: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.nepalstock.com.np/historical-data',
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    if (data.length > 0) {
      console.log('Got data!', data.substring(0, 500));
    } else {
      console.log('Empty response from NEPSE.');
    }
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
