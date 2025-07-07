// pages/api/data.js

export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_WEBHOOK_URL; // URL Google Apps Script GET

  if (!GAS_URL) {
    return res.status(500).json({ error: "GAS_WEBHOOK_URL belum diset di .env" });
  }

  try {
    const response = await fetch(GAS_URL);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return res.status(500).json({ error: "Gagal parse JSON dari GAS", detail: text });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Gagal fetch dari GAS:", err);
    res.status(500).json({ error: "Fetch error", detail: err.message });
  }
}
