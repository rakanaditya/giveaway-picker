const { connectDB, Participant, Config, Log } = require('../db');
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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method tidak diizinkan" });
  }

  try {
    await connectDB();
    const { username, number } = req.body || {};
    const timestamp = new Date();
    const cleanUsername = String(username || "").trim();
    const parsedNumber = parseInt(number);

    if (!cleanUsername || isNaN(parsedNumber)) {
      await Log.create({ timestamp, action: "submit", username: cleanUsername || "-", details: "Invalid username or number" });
      return res.status(400).json({ error: "Username / angka kosong atau tidak valid" });
    }

    if (parsedNumber < 1 || parsedNumber > 1000) {
      return res.status(400).json({ error: "Angka harus antara 1–1000" });
    }

    // Cek apakah giveaway sedang buka (opsional, jika ingin validasi status waktu)
    const config = await Config.findOne({ key: 'settings' });
    const now = new Date();
    if (config && config.startTime && config.endTime) {
      if (now < new Date(config.startTime) || now > new Date(config.endTime)) {
        return res.status(400).json({ error: "Giveaway tidak sedang dibuka" });
      }
    }

    // Cek apakah sudah ikut hari ini
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existingParticipant = await Participant.findOne({
      username: cleanUsername.toLowerCase(),
      time: { $gte: startOfDay }
    });

    if (existingParticipant) {
      return res.status(400).json({ error: "Sudah ikut hari ini" });
    }

    const numberUsed = await Participant.findOne({ number: parsedNumber });
    if (numberUsed) {
      return res.status(400).json({ error: "Angka sudah dipakai" });
    }

    // Simpan partisipan baru ke MongoDB
    await Participant.create({ 
      time: new Date(), 
      username: cleanUsername.toLowerCase(), 
      number: parsedNumber 
    });

    await Log.create({ 
      timestamp, 
      action: "submit", 
      username: cleanUsername, 
      details: `Submit angka ${parsedNumber}` 
    });

    // Kirim notifikasi ke Discord webhook
    await sendDiscordWebhook(`🎉 **${cleanUsername}** ikut giveaway dengan angka **${parsedNumber}**!`);

    return res.status(200).json({ success: true, message: "Berhasil submit!" });

  } catch (err) {
    console.error("❌ Submit API Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
