export default async function handler(req, res) {
  const url = process.env.GAS_GIVEAWAY_URL;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("Gagal ambil giveaway:", err.message);
    res.status(500).json({ error: "Gagal ambil data giveaway", detail: err.message });
  }
}
