// pages/api/submit.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const GAS_URL = process.env.GAS_WEBHOOK_URL;
  if (!GAS_URL) return res.status(500).send("GAS_WEBHOOK_URL belum diset");

  const { author, content } = req.body;
  if (!author?.username || !content) {
    return res.status(400).send("Missing data");
  }

  const body = {
    username: author.username,
    message: content.toString()
  };

  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await r.text();
    res.status(200).send(text);
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).send("Server error");
  }
}
