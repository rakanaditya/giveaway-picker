export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL) {
    return res.status(500).send("❌ GAS_URL belum diset di .env");
  }

  if (req.method === "POST") {
    const { author, content } = req.body;

    if (!author?.username || !content) {
      return res.status(400).send("❌ Missing data: username atau content");
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
      return res.status(200).send(text); // biasanya "OK"
    } catch (err) {
      console.error("Gagal kirim POST ke GAS:", err);
      return res.status(500).send("❌ Gagal kirim ke GAS");
    }
  }

  else if (req.method === "GET") {
    try {
      const response = await fetch(GAS_URL);
      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(500).json({ error: "❌ Gagal parse JSON dari GAS", detail: text });
      }

      return res.status(200).json(data);
    } catch (err) {
      console.error("Gagal fetch GET dari GAS:", err);
      return res.status(500).json({ error: "❌ Fetch error", detail: err.message });
    }
  }

  else {
    return res.status(405).send("❌ Method tidak didukung");
  }
}
