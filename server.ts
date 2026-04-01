import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Route to fetch prices from NEPSE API
  app.get("/api/prices", async (req, res) => {
    const symbols = ((req.query.symbols as string) || "").split(",");
    const results: Record<string, { price: number; change: number }> = {};
    
    try {
      const fetchPromises = symbols.map(async (sym) => {
        if (!sym) return;
        try {
          const response = await fetch(`https://nepsetty.kokomo.workers.dev/api?symbol=${sym}`);
          if (response.ok) {
            const data = await response.json();
            // The API returns { price, change, volume }
            if (data && data.price) {
              results[sym] = {
                price: parseFloat(data.price),
                change: parseFloat(data.change || 0)
              };
            }
          }
        } catch (e) {
          console.error(`Failed to fetch ${sym}:`, e);
        }
      });
      
      await Promise.all(fetchPromises);
      res.json(results);
    } catch (error) {
      console.error("Error in /api/prices:", error);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
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
