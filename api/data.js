export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return res.status(500).send("GAS_URL belum diset di .env");

  if (req.method === "POST") {
    const { action, username, password, message, data } = req.body || {};

    // === Validasi dasar ===
    if (!action || !username) {
      return res.status(400).send("Missing action or username");
    }

    if (typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).send("Username tidak valid");
    }

    // === SET DEADLINE (ADMIN ONLY) ===
    if (action === "setDeadline") {
      if (!data?.startTime || !data?.endTime) {
        return res.status(400).send("Missing deadline data");
      }

      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "setDeadline",
            username,
            startTime: data.startTime,
            endTime: data.endTime,
          }),
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        console.error("❌ Error setDeadline:", err.message);
        return res.status(500).send("Gagal set deadline");
      }
    }

    // === REGISTER / LOGIN ===
    if (action === "register" || action === "login") {
      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, username, password }),
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        console.error("❌ Error koneksi GAS (auth):", err.message);
        return res.status(500).send("Gagal koneksi ke GAS (auth)");
      }
    }

    // === SUBMIT GIVEAWAY ===
    if (action === "submit") {
      if (!message) return res.status(400).send("Missing angka");

      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit",
            username,
            message,
          }),
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        console.error("❌ Error kirim angka:", err.message);
        return res.status(500).send("Gagal kirim angka ke GAS");
      }
    }

    // === RESET DATA (ADMIN) ===
    if (action === "reset") {
      try {
        const resGAS = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset", username }),
        });
        const text = await resGAS.text();
        return res.status(200).send(text);
      } catch (err) {
        console.error("❌ Error reset data:", err.message);
        return res.status(500).send("Gagal reset data");
      }
    }

    return res.status(400).send("Action tidak dikenali");
  }

  // === GET Peserta & Winner ===
  if (req.method === "GET") {
    try {
      const response = await fetch(GAS_URL);
      const json = await response.json();

      // Hitung status jika belum disediakan oleh GAS
      if (!json.status && json.startTime && json.endTime) {
        const now = new Date();
        const start = new Date(json.startTime);
        const end = new Date(json.endTime);

        if (now < start) json.status = "upcoming";
        else if (now >= start && now <= end) json.status = "open";
        else json.status = "closed";
      }

      return res.status(200).json(json);
    } catch (err) {
      console.error("❌ Gagal ambil data:", err.message);
      return res.status(500).json({ error: "Gagal ambil data dari GAS" });
    }
  }

  return res.status(405).send("Method tidak diizinkan");
}
