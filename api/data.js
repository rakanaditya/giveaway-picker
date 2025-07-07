export default async function handler(req, res) {
  const url = process.env.GAS_GET_URL;
  if (!url) return res.status(500).send("GAS_GET_URL belum diset");

  try {
    const r = await fetch(url);
    const text = await r.text();
    const data = JSON.parse(text);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Fetch error", detail: err.message });
  }
}
