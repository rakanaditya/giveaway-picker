// pages/api/discord.js
export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_POST_URL;

  if (req.method !== "POST") return res.status(405).end();

  const { author, content } = req.body;

  if (!author || !content) return res.status(400).json({ error: "Missing data" });

  try {
    await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: author.username,
        message: content
      })
    });

    res.status(200).json({ status: "OK" });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengirim ke GAS", detail: err.message });
  }
}
