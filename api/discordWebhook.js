export default async function handler(req, res) {
  const body = req.body;
  const GAS_URL = process.env.GAS_WEBHOOK_URL; // ← Panggil dari .env

  if (!GAS_URL) {
    return res.status(500).json({ error: "GAS_WEBHOOK_URL tidak ditemukan di environment." });
  }

  if (body?.content && body?.author) {
    try {
      await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          username: body.author.username,
          message: body.content,
        }),
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Gagal kirim ke GAS:", err.message);
      return res.status(500).json({ error: "Gagal kirim data ke Google Apps Script" });
    }
  }

  res.status(200).send("OK");
}
