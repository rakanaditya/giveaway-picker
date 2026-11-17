const { connectDB, User, Participant, Config, Log } = require('../db');
const fetch = require('node-fetch');

async function sendDiscordWebhook(content) {
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error("Gagal kirim webhook Discord:", err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    await connectDB();
    const { method, body } = req;

    // === GET (Ambil Status & Data Giveaway) ===
    if (method === "GET") {
      const participantsRaw = await Participant.find().sort({ time: 1 });
      const participants = participantsRaw.map(p => ({
        time: p.time,
        username: p.username,
        number: p.number
      }));

      let config = await Config.findOne({ key: 'settings' });
      if (!config) {
        config = await Config.create({ key: 'settings', startTime: null, endTime: null });
      }

      const now = new Date();
      let status = "unknown";
      let winner = null;

      if (!config.startTime || !config.endTime) {
        status = "upcoming";
      } else if (now < new Date(config.startTime)) {
        status = "upcoming";
      } else if (now >= new Date(config.startTime) && now <= new Date(config.endTime)) {
        status = "open";
      } else {
        status = "closed";
        if (config.winnerUsername) {
          winner = {
            username: config.winnerUsername,
            number: config.winnerNumber
          };
        }
      }

      return res.status(200).json({
        participants,
        winner,
        startTime: config.startTime ? new Date(config.startTime).toISOString() : null,
        endTime: config.endTime ? new Date(config.endTime).toISOString() : null,
        status
      });
    }

    // === POST (Aksi: register, login, submit, reset, setDeadline) ===
    if (method === "POST") {
      const { action, username, password, number, startTime, endTime } = body || {};
      const timestamp = new Date();
      const cleanUsername = String(username || "").trim();

      if (!action) return res.status(400).json({ error: "Action tidak ada" });

      // 1. Register & Login
      if (action === "register" || action === "login") {
        if (!cleanUsername || !password) {
          await Log.create({ timestamp, action, username: cleanUsername || "-", details: "Missing data" });
          return res.status(400).json({ error: "Username / Password kosong" });
        }

        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, "i") } });

        if (action === "register") {
          if (existingUser) return res.status(400).json({ error: "Username sudah terdaftar" });
          if (/^\d+$/.test(password)) return res.status(400).json({ error: "Password tidak boleh hanya angka" });

          await User.create({ username: cleanUsername, password });
          await Log.create({ timestamp, action, username: cleanUsername, details: "Registrasi berhasil" });
          return res.status(200).json({ success: true, message: "Registrasi berhasil" });
        }

        if (!existingUser || existingUser.password !== password) {
          return res.status(400).json({ error: "Login gagal" });
        }

        await Log.create({ timestamp, action, username: cleanUsername, details: "Login berhasil" });
        return res.status(200).json({ success: true, message: "Login berhasil" });
      }

      // 2. Submit Tebakan Angka Giveaway
      if (action === "submit") {
        const parsedNumber = parseInt(number);
        if (!cleanUsername || isNaN(parsedNumber)) {
          await Log.create({ timestamp, action: "submit", username: cleanUsername || "-", details: "Invalid username or number" });
          return res.status(400).json({ error: "Username / angka kosong atau tidak valid" });
        }

        if (parsedNumber < 1 || parsedNumber > 1000) {
          return res.status(400).json({ error: "Angka harus antara 1–1000" });
        }

        // Cek apakah sudah ikut hari ini
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const existingParticipant = await Participant.findOne({
          username: cleanUsername.toLowerCase(),
          time: { $gte: startOfDay }
        });

        if (existingParticipant) return res.status(400).json({ error: "Sudah ikut hari ini" });

        const numberUsed = await Participant.findOne({ number: parsedNumber });
        if (numberUsed) return res.status(400).json({ error: "Angka sudah dipakai" });

        await Participant.create({ time: new Date(), username: cleanUsername.toLowerCase(), number: parsedNumber });
        await Log.create({ timestamp, action: "submit", username: cleanUsername, details: `Submit angka ${parsedNumber}` });

        await sendDiscordWebhook(`🎉 **${cleanUsername}** ikut giveaway dengan angka **${parsedNumber}**!`);

        return res.status(200).json({ success: true, message: "Berhasil submit!" });
      }

      // 3. Set Deadline Giveaway (Admin Only)
      if (action === "setDeadline") {
        const allowedAdmins = ["rakanaditya"];
        if (!cleanUsername || !allowedAdmins.includes(cleanUsername.toLowerCase())) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        if (!startTime || !endTime) {
          return res.status(400).json({ error: "Data deadline tidak lengkap" });
        }

        try {
          const start = new Date(startTime);
          const end = new Date(endTime);

          await Config.findOneAndUpdate(
            { key: 'settings' },
            { startTime: start, endTime: end },
            { upsert: true, new: true }
          );

          return res.status(200).json({ success: true, message: "Deadline diatur" });
        } catch (err) {
          return res.status(400).json({ error: "Invalid date format" });
        }
      }

      // 4. Reset Giveaway (Admin Only)
      if (action === "reset") {
        const allowedAdmins = ["rakanaditya"];
        if (!cleanUsername || !allowedAdmins.includes(cleanUsername.toLowerCase())) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        await Participant.deleteMany({});
        await Config.findOneAndUpdate(
          { key: 'settings' },
          { winnerUsername: null, winnerNumber: null },
          { upsert: true }
        );

        await Log.create({ timestamp, action: "reset", username: cleanUsername, details: "Reset giveaway & winner" });

        await sendDiscordWebhook(
          `🔄 **GIVEAWAY DI-RESET**\n` +
          `👤 Admin: **${cleanUsername}**\n` +
          `🕒 Waktu: **${new Date().toLocaleString("id-ID")}**\n` +
          `🎁 Giveaway siap dimulai ulang!`
        );

        return res.status(200).json({ success: true, message: "Giveaway & winner berhasil di-reset" });
      }

      await Log.create({ timestamp, action: "invalid_action", username: cleanUsername || "-", details: `Action: ${action}` });
      return res.status(400).json({ error: "Action tidak dikenali" });
    }

    return res.status(405).json({ error: "Method tidak diizinkan" });
  } catch (err) {
    console.error("❌ API Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
