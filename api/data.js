export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL) {
    return res.status(500).json({ error: 'GAS_URL tidak terdefinisi di .env.local' });
  }

  const { method, body } = req;

  // === Helper POST ke GAS (doPost) ===
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
      console.error(`❌ Error [${payload.action}]:`, err.message);
      return res.status(500).send(`Gagal ${payload.action} ke GAS`);
    }
  };

  // === GET => Ambil status giveaway ===
  if (method === "GET") {
    try {
      const response = await fetch(`${GAS_URL}?action=getStatus`);
      const data = await response.json();

      return res.status(200).json({
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        participants: data.participants || [],
        winner: data.winner || null,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Gagal mengambil data: ' + error.message });
    }
  }

  // === POST => Kirim aksi ke GAS ===
  if (method === "POST") {
    const { action, username, password, message, startTime, endTime } = body;

    if (!action) return res.status(400).send("Missing action");

    // === ACTIONS ===

    // Register / Login
    if (action === "register" || action === "login") {
      if (!password) return res.status(400).send("Password kosong");
      return await postToGAS({ action, username, password });
    }

    // Set Deadline (admin only)
    if (action === "setDeadline") {
      if (!startTime || !endTime) {
        return res.status(400).send("Missing deadline data");
      }
      return await postToGAS({ action, username, startTime, endTime });
    }

    // Submit angka
    if (action === "submit") {
      if (!message) return res.status(400).send("Missing angka");
      return await postToGAS({ action, username, message });
    }

    // Reset peserta
    if (action === "reset") {
      return await postToGAS({ action, username });
    }

    // Tidak dikenal
    return res.status(400).send("Action tidak dikenali");
  }

  // Method selain GET/POST ditolak
  return res.status(405).send("Method tidak diizinkan");
}
