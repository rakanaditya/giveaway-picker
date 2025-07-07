export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") return res.status(405).send("Hanya menerima POST");

  const { author, content } = req.body;
  if (!author?.username || !content) return res.status(400).send("Missing data");

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
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).send("Gagal kirim ke GAS");
  }
}
