export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL) {
    return res.status(500).json({ error: 'GAS_URL belum diset di .env.local' });
  }

  const { method, body } = req;

  // === Helper untuk POST ke Google Apps Script ===
  const postToGAS = async (payload) => {
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await response.text();

      // Coba parse jika bisa JSON, kalau tidak kirim string biasa
      try {
        const json = JSON.parse(text);
        return res.status(200).json(json);
      } catch {
        return res.status(200).send(text);
      }
    } catch (err) {
      console.error(`❌ Error saat postToGAS [${payload.action}]:`, err.message);
      return res.status(500).json({ error: `Gagal ${payload.action}: ${err.message}` });
    }
  };

  // === GET (ambil status giveaway) ===
  if (method === "GET") {
    try {
      const response = await fetch(`${GAS_URL}?action=getStatus`);
      const text = await response.text();

      try {
        const json = JSON.parse(text);
        return res.status(200).json(json);
      } catch (parseError) {
        console.warn("⚠️ Respon dari GAS bukan JSON:", text);
        return res.status(500).json({ error: "Respon GAS bukan JSON", raw: text });
      }
    } catch (err) {
      console.error("❌ Gagal fetch getStatus:", err.message);
      return res.status(500).json({ error: "Gagal ambil status: " + err.message });
    }
  }

  // === POST (aksi: register, login, submit, reset, setDeadline) ===
  if (method === "POST") {
    const { action, username, password, message, startTime, endTime } = body;

    if (!action) return res.status(400).json({ error: "Action tidak ada" });

    switch (action) {
      case "register":
      case "login":
        if (!username || !password) return res.status(400).json({ error: "Username / Password kosong" });
        return await postToGAS({ action, username, password });

      case "submit":
        if (!username || !message) return res.status(400).json({ error: "Username / angka kosong" });
        return await postToGAS({ action, username, message });

      case "reset":
        if (!username) return res.status(400).json({ error: "Username kosong" });
        return await postToGAS({ action, username });

      case "setDeadline":
        if (!username || !startTime || !endTime)
          return res.status(400).json({ error: "Data deadline tidak lengkap" });
        return await postToGAS({ action, username, startTime, endTime });

      default:
        return res.status(400).json({ error: "Action tidak dikenali" });
    }
  }

  // === Jika bukan GET/POST
  return res.status(405).json({ error: "Method tidak diizinkan" });
}
