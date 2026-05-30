const https = require("https");
 
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });
 
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta GROQ_API_KEY en Vercel Environment Variables" });
 
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
 
  const { messages, system } = body;
  if (!messages || !messages.length) return res.status(400).json({ error: "Falta messages" });
 
  // Groq uses OpenAI-compatible format
  const groqMessages = [];
  if (system) groqMessages.push({ role: "system", content: system });
  messages.forEach(m => groqMessages.push({ role: m.role, content: m.content }));
 
  const payload = JSON.stringify({
    model: "llama-3.1-8b-instant",
    max_tokens: 400,
    temperature: 0.2,
    messages: groqMessages
  });
 
  return new Promise((resolve) => {
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${apiKey}`
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
              error: parsed?.error?.message || data.slice(0, 300)
            });
          }
          // Convert to Anthropic format so app works without changes
          const text = parsed?.choices?.[0]?.message?.content || "{}";
          res.status(200).json({ content: [{ type: "text", text }] });
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
 
