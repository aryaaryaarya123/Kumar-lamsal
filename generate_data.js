import fs from 'fs';
import https from 'https';

const symbols = JSON.parse(fs.readFileSync('./symbols.json', 'utf8'));
const uniqueSymbols = [...new Set(symbols)];

function getNepalDateStr(date) {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const npTime = new Date(utc + (3600000 * 5.75));
  return npTime.toISOString().split('T')[0];
}

const history = [];
const today = new Date();

async function fetchRealHistory(sym) {
  return new Promise((resolve) => {
    const url = `https://raw.githubusercontent.com/Aabishkar2/nepse-data/main/data/company-wise/${sym}.csv`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const lines = data.split('\n').filter(l => l.trim().length > 0);
        const headers = lines[0].split(',');
        const dateIdx = headers.indexOf('published_date');
        const closeIdx = headers.indexOf('close');
        const volIdx = headers.indexOf('traded_quantity');
        
        if (dateIdx === -1 || closeIdx === -1) {
          resolve(null);
          return;
        }

        const records = lines.slice(1).map(l => {
          const cols = l.split(',');
          return {
            date_str: cols[dateIdx],
            symbol: sym,
            price: parseFloat(cols[closeIdx]),
            volume: volIdx !== -1 ? parseInt(cols[volIdx]) || 0 : 0
          };
        }).filter(r => !isNaN(r.price));

        // Take only the last 365 days
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(today.getFullYear() - 1);
        const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];
        
        resolve(records.filter(r => r.date_str >= oneYearAgoStr));
      });
    }).on('error', () => resolve(null));
  });
}

async function generateAll() {
  console.log(`Processing ${uniqueSymbols.length} symbols...`);
  
  for (let i = 0; i < uniqueSymbols.length; i++) {
    const sym = uniqueSymbols[i];
    process.stdout.write(`[${i+1}/${uniqueSymbols.length}] Fetching ${sym}... `);
    
    let realData = await fetchRealHistory(sym);
    
    if (realData && realData.length > 0) {
      console.log(`Got ${realData.length} real records.`);
      history.push(...realData);
    } else {
      console.log(`Failed. Generating simulated data.`);
      // Fallback: Random walk
      let hash = 0;
      for (let j = 0; j < sym.length; j++) hash = sym.charCodeAt(j) + ((hash << 5) - hash);
      let basePrice = 200 + (Math.abs(hash) % 800);
      let baseVolume = 1000 + (Math.abs(hash) % 9000);
      let currentPrice = basePrice;
      
      for (let j = 365; j >= 0; j--) {
        const date = new Date(today);
        date.setDate(today.getDate() - j);
        const dateStr = getNepalDateStr(date);
        const vol = baseVolume * (0.5 + Math.random());
        
        history.push({
          date_str: dateStr,
          symbol: sym,
          price: parseFloat(currentPrice.toFixed(2)),
          volume: Math.floor(vol)
        });
        const change = (Math.random() * 0.04) - 0.02;
        currentPrice = currentPrice * (1 + change);
      }
    }
    
    // Tiny delay to avoid rate limiting
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 100));
  }

  fs.writeFileSync('./database.json', JSON.stringify(history, null, 2));
  console.log(`Generated database.json with ${history.length} records.`);
}

generateAll();
