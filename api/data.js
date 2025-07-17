export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return res.status(500).send("GAS_URL belum diset di .env");

  // === GET: Ambil data peserta dan winner ===
  if (req.method === "GET") {
    try {
      const response = await fetch(GAS_URL);
      const json = await response.json();

      // Hitung status jika belum ada (fallback)
      if (!json.status && json.startTime && json.endTime) {
        const now = new Date();
        const start = new Date(json.startTime);
        const end = new Date(json.endTime);
        json.status = now < start ? "upcoming" : now <= end ? "open" : "closed";
      }

      return res.status(200).json(json);
    } catch (err) {
      console.error("❌ Gagal ambil data:", err.message);
      return res.status(500).json({ error: "Gagal ambil data dari GAS" });
    }
  }

  // === POST ===
  if (req.method === "POST") {
    const { action, username, password, message, data } = req.body || {};

    // Validasi dasar
    if (!action || !username) {
      return res.status(400).send("Missing action or username");
    }
    if (typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).send("Username tidak valid");
    }

    // Helper fetch ke GAS
    const postToGAS = async (payload) => {
      try {
        const response = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await response.text();
        return res.status(200).send(text);
      } catch (err) {
        console.error(`❌ Error [${action}]:`, err.message);
        return res.status(500).send(`Gagal ${action} ke GAS`);
      }
    };

    // === ACTIONS ===

    // Register / Login
    if (action === "register" || action === "login") {
      if (!password) return res.status(400).send("Password kosong");
      return await postToGAS({ action, username, password });
    }

    // Set Deadline (admin only)
    if (action === "setDeadline") {
      if (!data?.startTime || !data?.endTime) {
        return res.status(400).send("Missing deadline data");
      }
      return await postToGAS({
        action: "setDeadline",
        username,
        startTime: data.startTime,
        endTime: data.endTime,
      });
    }

    // Submit Angka
    if (action === "submit") {
      if (!message) return res.status(400).send("Missing angka");
      return await postToGAS({
        action: "submit",
        username,
        message,
      });
    }

    // Reset Data (admin only)
    if (action === "reset") {
      return await postToGAS({ action: "reset", username });
    }

    // Jika tidak dikenali
    return res.status(400).send("Action tidak dikenali");
  }

  return res.status(405).send("Method tidak diizinkan");
}
