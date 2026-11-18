const { connectDB, Participant } = require('../db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: "Method tidak diizinkan" });

  try {
    await connectDB();
    const { username, number } = req.body || {};
    const cleanUsername = String(username || "").trim();
    const parsedNumber = parseInt(number, 10);

    if (!cleanUsername || isNaN(parsedNumber) || parsedNumber < 1 || parsedNumber > 1000) {
      return res.status(400).json({ success: false, message: "Angka harus antara 1–1000" });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await Participant.findOne({ username: cleanUsername.toLowerCase(), time: { $gte: startOfDay } });
    if (existing) return res.status(400).json({ success: false, message: "Sudah ikut hari ini" });

    const numberUsed = await Participant.findOne({ number: parsedNumber });
    if (numberUsed) return res.status(400).json({ success: false, message: "Angka sudah dipakai" });

    await Participant.create({ time: new Date(), username: cleanUsername.toLowerCase(), number: parsedNumber });

    const webhook = process.env.DISCORD_WEBHOOK;
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `🎉 **${cleanUsername}** ikut giveaway dengan angka **${parsedNumber}**!` })
      });
    }

    return res.status(200).json({ success: true, message: "Berhasil submit!" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server Error", details: err.message });
  }
};
