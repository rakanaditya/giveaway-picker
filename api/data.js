export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return res.status(500).send("GAS_URL belum diset di .env");

  if (req.method === "POST") {
    try {
      const body = req.body;

      // ✅ LOGIN / REGISTER
      if (body.action && body.username && body.password) {
        const payload = {
          action: body.action,
          username: body.username,
          password: body.password,
          captcha: body.captcha || "" // untuk register yang pakai reCAPTCHA
        };

        const r = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const text = await r.text();
        return res.status(200).send(text);
      }

      // ✅ SUBMIT ANGKA GIVEAWAY
      if (body.author?.username && body.content !== undefined) {
        const r = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: body.author.username,
            message: body.content.toString()
          })
        });

        const text = await r.text();
        return res.status(200).send(text);
      }

      return res.status(400).send("Data POST tidak valid");
    } catch (err) {
      console.error("POST to GAS failed:", err);
      return res.status(500).send("Gagal kirim ke GAS");
    }
  }

  // ✅ GET: Fetch peserta dan pemenang
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
