export default async function handler(req, res) {
  const url = process.env.GAS_POST_URL;
  if (req.method !== "POST") return res.status(405).send("Hanya POST");

  const { author, content } = req.body;
  if (!author?.username || !content) return res.status(400).send("Missing data");

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: author.username, message: content.toString() })
    });
    const text = await r.text();
    res.status(200).send(text);
  } catch (err) {
    res.status(500).send("Gagal kirim ke GAS");
  }
}
