import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import session from "express-session";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("appointments.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_name TEXT NOT NULL,
    company TEXT,
    purpose TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_name TEXT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: "achal-jewels-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: 'none',
      httpOnly: true 
    }
  }));

  const PORT = 3000;
  console.log("Server starting. GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);

  // Google OAuth Setup
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/auth/google/callback`
  );

  // API Routes
  app.get("/api/config", (req, res) => {
    res.json({ 
      hasApiKey: !!process.env.GEMINI_API_KEY,
      model: "gemini-2.0-flash-exp"
    });
  });

  app.get("/api/health", (req, res) => {
    try {
      const count = db.prepare("SELECT COUNT(*) as count FROM appointments").get() as { count: number };
      res.json({ status: "ok", db: "connected", appointments: count.count });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  app.get("/api/appointments", (req, res) => {
    const rows = db.prepare("SELECT * FROM appointments ORDER BY date, time").all();
    res.json(rows);
  });

  app.post("/api/appointments", (req, res) => {
    const { caller_name, company, purpose, date, time } = req.body;
    const info = db.prepare(
      "INSERT INTO appointments (caller_name, company, purpose, date, time) VALUES (?, ?, ?, ?, ?)"
    ).run(caller_name, company, purpose, date, time);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/appointments", (req, res) => {
    const { old_date, old_time, new_date, new_time } = req.body;
    const info = db.prepare(
      "UPDATE appointments SET date = ?, time = ? WHERE date = ? AND time = ?"
    ).run(new_date, new_time, old_date, old_time);
    res.json({ updated: info.changes });
  });

  app.delete("/api/appointments", (req, res) => {
    const { date, time } = req.body;
    const info = db.prepare(
      "DELETE FROM appointments WHERE date = ? AND time = ?"
    ).run(date, time);
    res.json({ deleted: info.changes });
  });

  app.get("/api/availability", (req, res) => {
    const { date, time } = req.query;
    const row = db.prepare(
      "SELECT * FROM appointments WHERE date = ? AND time = ?"
    ).get(date, time);
    res.json({ available: !row });
  });

  app.post("/api/messages", (req, res) => {
    const { caller_name, message } = req.body;
    const info = db.prepare(
      "INSERT INTO messages (caller_name, message) VALUES (?, ?)"
    ).run(caller_name, message);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/messages", (req, res) => {
    const rows = db.prepare("SELECT * FROM messages ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.delete("/api/messages/:id", (req, res) => {
    const { id } = req.params;
    const info = db.prepare("DELETE FROM messages WHERE id = ?").run(id);
    res.json({ deleted: info.changes });
  });

  // Google OAuth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/drive.file"],
      prompt: "select_account"
    });
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      (req.session as any).tokens = tokens;
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err) {
      console.error("Error exchanging code for tokens:", err);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/status", (req, res) => {
    res.json({ isAuthenticated: !!(req.session as any).tokens });
  });

  app.post("/api/export/drive", async (req, res) => {
    const tokens = (req.session as any).tokens;
    if (!tokens) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    try {
      oauth2Client.setCredentials(tokens);
      const drive = google.drive({ version: "v3", auth: oauth2Client });

      const appointments = db.prepare("SELECT * FROM appointments ORDER BY date, time").all() as any[];
      const messages = db.prepare("SELECT * FROM messages ORDER BY created_at DESC").all() as any[];

      let content = "ACHAL JEWELS - OFFICE OVERVIEW\n";
      content += `Generated at: ${new Date().toLocaleString()}\n\n`;
      
      content += "--- UPCOMING APPOINTMENTS ---\n";
      appointments.forEach(a => {
        content += `[${a.date} ${a.time}] ${a.caller_name} (${a.company || 'N/A'}) - ${a.purpose || 'No purpose'}\n`;
      });

      content += "\n--- RECENT MESSAGES ---\n";
      messages.forEach(m => {
        content += `[${new Date(m.created_at).toLocaleString()}] From: ${m.caller_name || 'Anonymous'} - ${m.message}\n`;
      });

      const fileMetadata = {
        name: `Achal_Jewels_Overview_${new Date().toISOString().split('T')[0]}.txt`,
        mimeType: "text/plain"
      };
      
      const media = {
        mimeType: "text/plain",
        body: content
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, webViewLink"
      });

      res.json({ success: true, fileId: response.data.id, link: response.data.webViewLink });
    } catch (err: any) {
      console.error("Error exporting to Drive:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
      }
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
