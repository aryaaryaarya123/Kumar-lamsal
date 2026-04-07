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

  // API Route to fetch prices from NEPSE API and compare with DB
  app.get("/api/prices", async (req, res) => {
    const symbols = ((req.query.symbols as string) || "").split(",").filter(Boolean);
    if (!symbols.length) return res.json({});

    const todayStr = getNepalDateStr();
    const results: Record<string, { price: number; change: number; history: {date: string, price: number}[] }> = {};

    // 1. Fetch live prices
    const livePrices: Record<string, number> = {};
    await Promise.all(symbols.map(async (sym) => {
      try {
        const response = await fetch(`https://nepsetty.kokomo.workers.dev/api/stock?symbol=${sym}`);
        if (response.ok) {
          const data = await response.json();
          const price = parseFloat(data.ltp || 0);
          if (price > 0) {
            livePrices[sym] = price;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch live price for ${sym}`);
      }
    }));

    // 2. Try to get previous day's prices from DB and save today's prices
    let dbAvailable = false;
    let previousPrices: Record<string, number> = {};
    const historyData: Record<string, {date: string, price: number}[]> = {};

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
          `INSERT INTO daily_prices (date_str, symbol, price) VALUES ($1, $2, $3)
           ON CONFLICT (date_str, symbol) DO UPDATE SET price = EXCLUDED.price`,
          [todayStr, sym, livePrices[sym]]
        );
      }
      
      // Fetch last 30 days of history for the charts
      const historyRes = await pool.query(
        `SELECT date_str, symbol, price FROM daily_prices 
         WHERE date_str >= $1 
         ORDER BY date_str ASC`,
        [getNepalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))]
      );
      
      historyRes.rows.forEach(row => {
        if (!historyData[row.symbol]) historyData[row.symbol] = [];
        historyData[row.symbol].push({ date: row.date_str, price: parseFloat(row.price) });
      });

      dbAvailable = true;
    } catch (err: any) {
      console.error("Database operation failed (expected if running outside Render):", err.message);
    }

    // 3. Combine results
    for (const sym of symbols) {
      const currentPrice = livePrices[sym] || 0;
      let change = 0;
      if (dbAvailable && previousPrices[sym] && currentPrice > 0) {
        change = currentPrice - previousPrices[sym];
      }
      results[sym] = { 
        price: currentPrice, 
        change,
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
