// server.js
// Minimal backend: hides your IBM API key, does the token exchange,
// calls your deployment, and serves the front-end.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// ---------- CONFIG ----------
const API_KEY = process.env.WATSONX_API_KEY;        // put in .env (never in client)
const REGION  = process.env.WATSONX_REGION  || "us-south";
const DEPLOYMENT_ID = process.env.WATSONX_DEPLOYMENT_ID; // your deployment id
const VERSION = process.env.WATSONX_VERSION || "2021-05-01";
const PORT = process.env.PORT || 3000;

if (!API_KEY || !DEPLOYMENT_ID) {
  console.error("Missing env: WATSONX_API_KEY and/or WATSONX_DEPLOYMENT_ID");
  process.exit(1);
}

const app = express();
app.use(cors());               // in production, restrict to your web origin
app.use(express.json());

// Serve static front-end from /public
app.use(express.static(path.join(__dirname, "public")));

// Helper: get IAM token
async function getIamToken() {
  const res = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: API_KEY
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IAM token failed: ${res.status} - ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Proxy endpoint the browser calls instead of IBM directly
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    const token = await getIamToken();

    const url = `https://${REGION}.ml.cloud.ibm.com/ml/v4/deployments/${DEPLOYMENT_ID}/ai_service?version=${VERSION}`;
    const inferRes = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }]
      })
    });

    const data = await inferRes.json();

    // normalize reply shape (Agent Service often returns output.generic[0].text)
    // normalize reply shape
   // normalize reply shape
   const reply =
   data?.output?.generic?.[0]?.text ||                // Watson Assistant
   data?.results?.[0]?.generated_text ||              // Watsonx text gen
   data?.choices?.[0]?.message?.content ||            // OpenAI-style Watsonx
   JSON.stringify(data, null, 2);                     // fallback JSON

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Fallback to index.html for unmatched routes (single page app)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () =>
  console.log(`RegionalMate server on http://localhost:${PORT}`)
);
