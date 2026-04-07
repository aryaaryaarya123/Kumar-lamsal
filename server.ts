import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import pg from "pg";

const { Pool } = pg;

// Use the provided internal URL, but allow override via env var
const DB_URL = process.env.DATABASE_URL || "postgresql://ledger_wvaw_user:TXprx4S69vzdHJmQ4ageu6bvwMQ11EEJ@dpg-d6vnm31r0fns73cd9k00-a/ledger_wvaw";

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL.includes('render.com') ? { rejectUnauthorized: false } : undefined
});

// Helper to get Nepal date string YYYY-MM-DD
function getNepalDateStr(date = new Date()) {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const npTime = new Date(utc + (3600000 * 5.75));
  return npTime.toISOString().split('T')[0];
}

// Initialize DB and seed historical data if empty
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_prices (
        date_str VARCHAR(10) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        price NUMERIC NOT NULL,
        PRIMARY KEY (date_str, symbol)
      );
    `);
    console.log("Database initialized successfully");

    // Check if we need to seed historical data
    const countRes = await pool.query(`SELECT COUNT(*) FROM daily_prices`);
    if (parseInt(countRes.rows[0].count) < 10) {
      console.log("Database is mostly empty. Seeding 30 days of historical data...");
      await seedHistoricalData();
    }
  } catch (err: any) {
    console.error("Failed to initialize database. Note: Internal Render URLs only work on Render.", err.message);
  }
}

async function seedFromJSON() {
  const jsonPath = path.join(process.cwd(), "database.json");
  if (!fs.existsSync(jsonPath)) {
    console.log("No database.json found for seeding.");
    // Fallback to the original random seeder if JSON is missing
    return await seedHistoricalData();
  }

  try {
    const rawData = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(rawData);
    console.log(`Seeding ${data.length} records into the database...`);
    
    // Process in batches of 100 to avoid overwhelming the pool
    for (let i = 0; i < data.length; i += 100) {
      const batch = data.slice(i, i + 100);
      const queries = batch.map((row: any) => 
        pool.query(
          `INSERT INTO daily_prices (date_str, symbol, price) VALUES ($1, $2, $3)
           ON CONFLICT (date_str, symbol) DO NOTHING`,
          [row.date_str, row.symbol, row.price]
        )
      );
      await Promise.all(queries);
    }
    console.log("Database injection from JSON completed successfully.");
  } catch (err: any) {
    console.error("Failed to seed from JSON:", err.message);
  }
}

async function seedHistoricalData() {
  const symbols = ["NRN", "BANDIPUR", "HFIN", "SKHL", "PPCL", "SOHL", "DHEL", "HBL", "OMPL", "SYPNL"];
  const today = new Date();
  
  for (const sym of symbols) {
    try {
      // Get current price to base history on
      const response = await fetch(`https://nepsetty.kokomo.workers.dev/api/stock?symbol=${sym}`);
      if (!response.ok) continue;
      const data = await response.json();
      const currentPrice = parseFloat(data.ltp || 0);
      
      if (currentPrice > 0) {
        let simulatedPrice = currentPrice;
        
        // Go back 30 days
        for (let i = 30; i >= 0; i--) {
          const pastDate = new Date(today);
          pastDate.setDate(today.getDate() - i);
          const dateStr = getNepalDateStr(pastDate);
          
          // Insert simulated price
          await pool.query(
            `INSERT INTO daily_prices (date_str, symbol, price) VALUES ($1, $2, $3)
             ON CONFLICT (date_str, symbol) DO NOTHING`,
            [dateStr, sym, simulatedPrice.toFixed(2)]
          );
          
          // Random walk backwards (between -2% and +2%)
          const changePercent = (Math.random() * 0.04) - 0.02;
          simulatedPrice = simulatedPrice / (1 + changePercent);
        }
      }
    } catch (e) {
      console.error(`Failed to seed ${sym}`);
    }
  }
  console.log("Historical data seeding complete.");
}

initDB();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // API Route to fetch a single stock for the Market Terminal
  app.get("/api/stock/:symbol", async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
      let stock = null;
      let ltp = 0, prevClose = 0, pointChange = 0, percentChange = 0, open = 0, high = 0, low = 0, volume = 0;

      // 1. Try NEPSE directly
      try {
        const response = await fetch('https://newweb.nepalstock.com/api/nots/nepse-data/today-price?&size=500', {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://newweb.nepalstock.com/',
          }
        });
        if (response.ok) {
          const data = await response.json();
          const stocks = Array.isArray(data) ? data : (data.content || []);
          stock = stocks.find((s: any) => s.symbol === symbol);
          if (stock) {
            ltp = stock.closePrice || stock.lastTradedPrice || 0;
            prevClose = stock.previousDayClosePrice || 0;
            open = stock.openPrice || 0;
            high = stock.highPrice || 0;
            low = stock.lowPrice || 0;
            volume = stock.totalTradeQuantity || stock.volume || 0;
            pointChange = ltp - prevClose;
            percentChange = prevClose ? (pointChange / prevClose) * 100 : 0;
          }
        }
      } catch (e) {
        // Fallback below
      }

      // 2. Try the existing proxy fallback
      if (!stock) {
        const fbRes = await fetch(`https://nepsetty.kokomo.workers.dev/api/stock?symbol=${symbol}`);
        if (!fbRes.ok) throw new Error("Fallback API down");
        const fbData = await fbRes.json();
        
        if (!fbData.symbol || !fbData.ltp) {
          return res.status(404).json({ error: "Invalid scrip symbol" });
        }
        
        ltp = parseFloat(fbData.ltp);
        pointChange = parseFloat(fbData.pointChange || "0");
        percentChange = parseFloat(fbData.percentChange || "0");
        open = parseFloat(fbData.open || "0");
        high = parseFloat(fbData.high || "0");
        low = parseFloat(fbData.low || "0");
        volume = parseFloat(fbData.volume || "0");
      }

      res.json({ symbol, ltp, pointChange, percentChange, open, high, low, volume });
    } catch (error) {
      res.status(502).json({ error: "Data currently unavailable from NEPSE." });
    }
  });

  // API Route to fetch prices from NEPSE API and compare with DB
  app.get("/api/prices", async (req, res) => {
    const symbols = ((req.query.symbols as string) || "").split(",").filter(Boolean);
    if (!symbols.length) return res.json({});

    const todayStr = getNepalDateStr();
    const results: Record<string, { 
      price: number; 
      change: number; 
      totalVolume1Y: number;
      history: {date: string, price: number, volume: number}[] 
    }> = {};

    // 1. Fetch live prices
    const livePrices: Record<string, { price: number; volume: number }> = {};
    await Promise.all(symbols.map(async (sym) => {
      try {
        const response = await fetch(`https://nepsetty.kokomo.workers.dev/api/stock?symbol=${sym}`);
        if (response.ok) {
          const data = await response.json();
          const price = parseFloat(data.ltp || 0);
          const volume = parseFloat(data.volume || 0);
          if (price > 0) {
            livePrices[sym] = { price, volume };
          }
        }
      } catch (e) {
        console.error(`Failed to fetch live price for ${sym}`);
      }
    }));

    // 2. Try to get previous day's prices from DB and save today's prices
    let dbAvailable = false;
    let previousPrices: Record<string, number> = {};
    const historyData: Record<string, {date: string, price: number, volume: number}[]> = {};
    const totalVolume1Y: Record<string, number> = {};

    try {
      // Get the most recent date in the DB that is strictly less than today
      const prevDateRes = await pool.query(
        `SELECT MAX(date_str) as prev_date FROM daily_prices WHERE date_str < $1`,
        [todayStr]
      );
      const prevDate = prevDateRes.rows[0]?.prev_date;

      if (prevDate) {
        const prevPricesRes = await pool.query(
          `SELECT symbol, price FROM daily_prices WHERE date_str = $1`,
          [prevDate]
        );
        prevPricesRes.rows.forEach(row => {
          previousPrices[row.symbol] = parseFloat(row.price);
        });
      }

      // Save today's prices
      for (const sym of Object.keys(livePrices)) {
        await pool.query(
          `INSERT INTO daily_prices (date_str, symbol, price, volume) VALUES ($1, $2, $3, $4)
           ON CONFLICT (date_str, symbol) DO UPDATE SET price = EXCLUDED.price, volume = EXCLUDED.volume`,
          [todayStr, sym, livePrices[sym].price, livePrices[sym].volume]
        );
      }
      
      // Fetch last 365 days of history and volume
      const historyRes = await pool.query(
        `SELECT date_str, symbol, price, volume FROM daily_prices 
         WHERE date_str >= $1 
         ORDER BY date_str ASC`,
        [getNepalDateStr(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))]
      );
      
      historyRes.rows.forEach(row => {
        if (!historyData[row.symbol]) historyData[row.symbol] = [];
        const vol = parseFloat(row.volume || 0);
        historyData[row.symbol].push({ 
          date: row.date_str, 
          price: parseFloat(row.price),
          volume: vol
        });
        totalVolume1Y[row.symbol] = (totalVolume1Y[row.symbol] || 0) + vol;
      });

      dbAvailable = true;
    } catch (err: any) {
      console.error("Database operation failed (expected if running outside Render):", err.message);
    }

    // 3. Combine results
    for (const sym of symbols) {
      const currentPrice = livePrices[sym]?.price || 0;
      let change = 0;
      if (dbAvailable && previousPrices[sym] && currentPrice > 0) {
        change = currentPrice - previousPrices[sym];
      }
      results[sym] = { 
        price: currentPrice, 
        change,
        totalVolume1Y: totalVolume1Y[sym] || 0,
        history: historyData[sym] || []
      };
    }

    res.json(results);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
