import fs from 'fs';

const symbols = JSON.parse(fs.readFileSync('./symbols.json', 'utf8'));
const uniqueSymbols = [...new Set(symbols)];

function getNepalDateStr(date) {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const npTime = new Date(utc + (3600000 * 5.75));
  return npTime.toISOString().split('T')[0];
}

const history = [];
const today = new Date();

console.log(`Generating data for ${uniqueSymbols.length} unique symbols...`);

for (const sym of uniqueSymbols) {
  // Generate a realistic base price based on symbol name (for consistency)
  let hash = 0;
  for (let i = 0; i < sym.length; i++) {
    hash = sym.charCodeAt(i) + ((hash << 5) - hash);
  }
  let basePrice = 200 + (Math.abs(hash) % 800);
  
  let currentPrice = basePrice;
  
  // 15 days of history
  for (let i = 15; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = getNepalDateStr(date);
    
    history.push({
      date_str: dateStr,
      symbol: sym,
      price: parseFloat(currentPrice.toFixed(2))
    });
    
    // Random walk
    const change = (Math.random() * 0.04) - 0.02; // -2% to +2%
    currentPrice = currentPrice * (1 + change);
  }
}

fs.writeFileSync('./database.json', JSON.stringify(history, null, 2));
console.log(`Generated database.json with ${history.length} records.`);
