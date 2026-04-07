import https from 'https';

const options = {
  hostname: 'newweb.nepalstock.com',
  path: '/api/nots/security-list',
  method: 'GET',
  rejectUnauthorized: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://newweb.nepalstock.com/',
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    if (data.length > 0) {
      console.log('Got data!', data.substring(0, 100));
    } else {
      console.log('Empty response from NEPSE.');
    }
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
