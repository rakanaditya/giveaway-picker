const { connectDB, User, Participant, Config, Log } = require('../db');

async function sendDiscordWebhook(content) {
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error("Gagal kirim webhook Discord:", err.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await connectDB();
    const { method, body } = req;

    if (method === "GET") {
      const participantsRaw = await Participant.find().sort({ time: 1 });
      const participants = participantsRaw.map(p => ({ time: p.time, username: p.username, number: p.number }));

      let config = await Config.findOne({ key: 'settings' });
      if (!config) {
        config = await Config.create({ key: 'settings', startTime: null, endTime: null });
      }

      const now = new Date();
      let status = "upcoming";
      let winner = null;

      if (config.startTime && config.endTime) {
        if (now < new Date(config.startTime)) status = "upcoming";
        else if (now >= new Date(config.startTime) && now <= new Date(config.endTime)) status = "open";
        else {
          status = "closed";
          if (config.winnerUsername) winner = { username: config.winnerUsername, number: config.winnerNumber };
        }
      }

      return res.status(200).json({ participants, winner, startTime: config.startTime, endTime: config.endTime, status });
    }

    if (method === "POST") {
      const { action, username, password } = body || {};
      const cleanUsername = String(username || "").trim();

      if (action === "register" || action === "login") {
        if (!cleanUsername || !password) {
          return res.status(400).json({ success: false, message: "Username dan password wajib diisi" });
        }

        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, "i") } });

        if (action === "register") {
          if (existingUser) return res.status(400).json({ success: false, message: "Username sudah terdaftar" });
          await User.create({ username: cleanUsername, password });
          return res.status(200).json({ success: true, message: "Registrasi berhasil" });
        }

        if (!existingUser || existingUser.password !== password) {
          return res.status(400).json({ success: false, message: "Username atau password salah" });
        }

        return res.status(200).json({ success: true, message: "Login berhasil" });
      }

      if (action === "reset") {
        await Participant.deleteMany({});
        await Config.findOneAndUpdate({ key: 'settings' }, { winnerUsername: null, winnerNumber: null }, { upsert: true });
        await sendDiscordWebhook(`🔄 **GIVEAWAY DI-RESET** oleh **${cleanUsername}**`);
        return res.status(200).json({ success: true, message: "Reset berhasil" });
      }
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan" });
  } catch (err) {
    console.error("API Data Error:", err);
    return res.status(500).json({ success: false, error: "Server Error", details: err.message });
  }
};
