import pg from "pg";
const { Pool } = pg;

const DB_URL = "postgresql://ledger_wvaw_user:TXprx4S69vzdHJmQ4ageu6bvwMQ11EEJ@dpg-d6vnm31r0fns73cd9k00-a/ledger_wvaw";

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'daily_prices'
    `);
    console.log("Schema for daily_prices:");
    console.table(res.rows);
    
    const countRes = await pool.query("SELECT COUNT(*) FROM daily_prices");
    console.log("Total records:", countRes.rows[0].count);

    const sampleRes = await pool.query("SELECT * FROM daily_prices LIMIT 5");
    console.log("Sample records:");
    console.table(sampleRes.rows);

    await pool.end();
  } catch (err) {
    console.error("Error checking schema:", err);
  }
}

checkSchema();
