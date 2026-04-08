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
        volume NUMERIC DEFAULT 0,
        high52 NUMERIC,
        low52 NUMERIC,
        PRIMARY KEY (date_str, symbol)
      );
    `);
    
    // Ensure new columns exist for existing tables
    try {
      await pool.query(`ALTER TABLE daily_prices ADD COLUMN IF NOT EXISTS volume NUMERIC DEFAULT 0`);
      await pool.query(`ALTER TABLE daily_prices ADD COLUMN IF NOT EXISTS high52 NUMERIC`);
      await pool.query(`ALTER TABLE daily_prices ADD COLUMN IF NOT EXISTS low52 NUMERIC`);
    } catch (e) {
      console.log("Columns update check complete.");
    }
    
    // Implement Rolling 1-Year Retention (FIFO)
    const deleteRes = await pool.query(`
      DELETE FROM daily_prices 
      WHERE TO_DATE(date_str, 'YYYY-MM-DD') < CURRENT_DATE - INTERVAL '1 year'
    `);
    if (deleteRes.rowCount > 0) {
      console.log(`Cleaned up ${deleteRes.rowCount} old records (Retention Policy: 1 Year).`);
    }

    console.log("Database initialized successfully");

    // Check if we need to seed historical data
    const countRes = await pool.query(`SELECT COUNT(*) FROM daily_prices`);
    if (parseInt(countRes.rows[0].count) < 100) {
      console.log("Database is empty or near empty. Seeding from database.json...");
      await seedFromJSON();
    }
  } catch (err: any) {
    console.error("Failed to initialize database. Note: Internal Render URLs only work on Render.", err.message);
  }
}

async function seedFromJSON() {
  const jsonPath = path.join(process.cwd(), "database.json");
  if (!fs.existsSync(jsonPath)) {
    console.log("No database.json found for seeding.");
    return await seedHistoricalData();
  }

  try {
    const rawData = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(rawData);
    console.log(`Seeding ${data.length} records into the database (Optimized with 52W)...`);
    
    const BATCH_SIZE = 1000;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      
      const values: any[] = [];
      const placeholders = batch.map((row: any, idx: number) => {
        const offset = idx * 6;
        values.push(row.date_str, row.symbol, row.price, row.volume || 0, row.high52, row.low52);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      }).join(",");

      const query = `
        INSERT INTO daily_prices (date_str, symbol, price, volume, high52, low52) 
        VALUES ${placeholders}
        ON CONFLICT (date_str, symbol) DO NOTHING
      `;
      
      await pool.query(query, values);
      if (i % 5000 === 0) console.log(`Injected ${i} records...`);
    }
    console.log("Database injection with 52W stats completed.");
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

async function startServer() {
  // Ensure DB is initialized before starting the server
  await initDB();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // API Route to fetch a single stock for the Market Terminal (Database Only)
  app.get("/api/stock/:symbol", async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
      // 1. Fetch the absolute latest record for current day stats
      const latestRes = await pool.query(
        `SELECT price, volume FROM daily_prices 
         WHERE symbol = $1 
         ORDER BY date_str DESC 
         LIMIT 1`,
        [symbol]
      );
      
      if (latestRes.rows.length === 0) {
        return res.status(404).json({ error: "Scrip symbol not found in database." });
      }

      const latest = latestRes.rows[0];
      const ltp = parseFloat(latest.price);
      const volume = parseFloat(latest.volume || 0);

      // 2. Fetch the REAL 52-week High and Low by scanning the last 365 days of price records
      const statsRes = await pool.query(
        `SELECT MAX(price) as high52, MIN(price) as low52 
         FROM daily_prices 
         WHERE symbol = $1 
         AND TO_DATE(date_str, 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '1 year'`,
        [symbol]
      );
      
      const high52 = parseFloat(statsRes.rows[0].high52 || ltp);
      const low52 = parseFloat(statsRes.rows[0].low52 || ltp);

      // 3. Fetch previous day's close to calculate change
      const prevRes = await pool.query(
        `SELECT price FROM daily_prices 
         WHERE symbol = $1 AND date_str < (SELECT MAX(date_str) FROM daily_prices WHERE symbol = $1)
         ORDER BY date_str DESC LIMIT 1`,
        [symbol]
      );

      let pointChange = 0;
      let percentChange = 0;
      if (prevRes.rows.length > 0) {
        const prevPrice = parseFloat(prevRes.rows[0].price);
        pointChange = ltp - prevPrice;
        percentChange = (pointChange / prevPrice) * 100;
      }

      res.json({ 
        symbol, 
        ltp, 
        pointChange, 
        percentChange, 
        volume,
        high52,
        low52,
        isDatabaseData: true 
      });
    } catch (error) {
      console.error("Terminal DB fetch failed:", error);
      res.status(500).json({ error: "Internal database error." });
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

      // Save today's prices with updated 52-week high/low
      for (const sym of Object.keys(livePrices)) {
        const ltp = livePrices[sym].price;
        const vol = livePrices[sym].volume;

        // Fetch current 52-week stats for this symbol
        const stats = await pool.query(
          `SELECT MAX(price) as h, MIN(price) as l FROM daily_prices 
           WHERE symbol = $1 AND TO_DATE(date_str, 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '1 year'`,
          [sym]
        );
        
        let high52 = Math.max(ltp, parseFloat(stats.rows[0].h || 0));
        let low52 = parseFloat(stats.rows[0].l || ltp);
        if (ltp > 0) low52 = Math.min(ltp, low52);

        await pool.query(
          `INSERT INTO daily_prices (date_str, symbol, price, volume, high52, low52) 
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date_str, symbol) DO UPDATE SET 
             price = EXCLUDED.price, 
             volume = EXCLUDED.volume,
             high52 = EXCLUDED.high52,
             low52 = EXCLUDED.low52`,
          [todayStr, sym, ltp, vol, high52, low52]
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
