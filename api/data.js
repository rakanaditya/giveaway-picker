// pages/api/data.js

export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return res.status(500).send("GAS_URL belum diset di .env");

  if (req.method === "POST") {
    const { action, username, password, message, captcha } = req.body || {};

    // === Validasi data dasar ===
    if (!action || !username) {
      return res.status(400).send("Missing action or username");
    }

 // ✅ Tambahkan validasi username aman
  if (typeof username !== "string" || username.trim().length < 3) {
    return res.status(400).send("Username tidak valid");
  }

    // === Untuk auth (register/login) ===
    if (action === "register" || action === "login") {
      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, username, password, captcha })
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        return res.status(500).send("Gagal koneksi ke GAS (auth)");
      }
    }

    // === Untuk ikut giveaway ===
    if (action === "submit") {
      if (!message) return res.status(400).send("Missing angka");
      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, message })
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        return res.status(500).send("Gagal kirim angka ke GAS");
      }
    }

    // === Untuk reset (admin) ===
    if (action === "reset") {
      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset", username })
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        return res.status(500).send("Gagal reset data");
      }
    }

    return res.status(400).send("Action tidak dikenali");
  }

  // === GET request: Ambil peserta + winner ===
  if (req.method === "GET") {
    try {
      const response = await fetch(GAS_URL);
      const json = await response.json();
      return res.status(200).json(json);
    } catch (err) {
      return res.status(500).json({ error: "Gagal ambil data dari GAS" });
    }
  }

  res.status(405).send("Method tidak diizinkan");
}
