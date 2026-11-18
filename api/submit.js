const { connectDB, Participant, Config, Log } = require('../db');
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method tidak diizinkan" });

  try {
    await connectDB();
    const { username, number } = req.body || {};
    const cleanUsername = String(username || "").trim();
    const parsedNumber = parseInt(number);

    if (!cleanUsername || isNaN(parsedNumber) || parsedNumber < 1 || parsedNumber > 1000) {
      return res.status(400).json({ error: "Angka harus antara 1–1000" });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await Participant.findOne({ username: cleanUsername.toLowerCase(), time: { $gte: startOfDay } });
    if (existing) return res.status(400).json({ error: "Sudah ikut hari ini" });

    const numberUsed = await Participant.findOne({ number: parsedNumber });
    if (numberUsed) return res.status(400).json({ error: "Angka sudah dipakai" });

    await Participant.create({ time: new Date(), username: cleanUsername.toLowerCase(), number: parsedNumber });

    const webhook = process.env.DISCORD_WEBHOOK;
    if (webhook) {
      await fetch(webhook, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `🎉 **${cleanUsername}** ikut giveaway dengan angka **${parsedNumber}**!` })
      });
    }

    return res.status(200).json({ success: true, message: "Berhasil submit!" });
  } catch (err) {
    return res.status(500).json({ error: "Server Error", details: err.message });
  }
};
