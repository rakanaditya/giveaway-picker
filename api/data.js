export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL) return res.status(500).send("GAS_URL belum diset di .env");

  try {
    const response = await fetch(GAS_URL);
    const text = await response.text();
    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Fetch error", detail: err.message });
  }
}
