import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Proxy for Nominatim Geocoding
  // This allows us to set the User-Agent header required by Nominatim
  app.get("/api/geocode", async (req, res) => {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: "Missing query parameter 'q'" });
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query as string)}&limit=1&email=brianhe.xiyu@gmail.com`;
      
      const response = await fetch(url, {
        headers: {
          // MANDATORY: Nominatim requires a valid User-Agent identifying the app
          "User-Agent": "VoyageurTravelPlanner/1.0 (brianhe.xiyu@gmail.com)",
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim API responded with status: ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Geocoding proxy error:", error);
      res.status(500).json({ error: "Failed to fetch geocoding data" });
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
