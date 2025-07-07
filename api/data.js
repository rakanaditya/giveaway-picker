export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return res.status(500).send("GAS_URL belum diset di .env");

  if (req.method === "POST") {
    const { author, content } = req.body;
    if (!author?.username || content === undefined) {
      return res.status(400).send("Missing data");
    }
    try {
      const r = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: author.username, message: content.toString() })
      });
      const text = await r.text();
      return res.status(200).send(text);
    } catch (err) {
      console.error("POST to GAS failed:", err);
      return res.status(500).send("Gagal kirim ke GAS");
    }
  }
  
  // GET request
  try {
    const r = await fetch(GAS_URL);
    const text = await r.text();
    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (err) {
    console.error("GET from GAS failed:", err);
    return res.status(500).json({ error: "Fetch error", detail: err.message });
  }
}
