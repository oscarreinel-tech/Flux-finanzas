const https = require("https");
 
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });
 
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta GEMINI_API_KEY en Vercel Environment Variables" });
 
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
 
  const { messages, system } = body;
  if (!messages || !messages.length) return res.status(400).json({ error: "Falta messages" });
 
  // Convert Anthropic format to Gemini format
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
 
  // Add system prompt as first user message if present
  if (system) {
    contents.unshift({
      role: "user",
      parts: [{ text: "INSTRUCCIONES DEL SISTEMA: " + system }]
    });
    contents.splice(1, 0, {
      role: "model",
      parts: [{ text: "Entendido. Seguiré esas instrucciones." }]
    });
  }
 
  const payload = JSON.stringify({
    contents,
    generationConfig: {
      maxOutputTokens: 400,
      temperature: 0.3
    }
  });
 
  const path = `/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
 
  return new Promise((resolve) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
 
    const apiReq = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", chunk => data += chunk);
      apiRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (apiRes.statusCode >= 400) {
            return res.status(apiRes.statusCode).json({
              error: parsed?.error?.message || data
            });
          }
          // Convert Gemini response to Anthropic format so the app works without changes
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
          res.status(200).json({
            content: [{ type: "text", text }]
          });
        } catch {
          res.status(500).json({ error: "Parse error: " + data.slice(0, 300) });
        }
        resolve();
      });
    });
 
    apiReq.on("error", (e) => {
      res.status(500).json({ error: e.message });
      resolve();
    });
 
    apiReq.write(payload);
    apiReq.end();
  });
};
