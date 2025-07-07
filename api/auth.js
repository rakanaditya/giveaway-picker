export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_AUTH_URL;
  if (req.method !== "POST") return res.status(405).end("Hanya POST");
  if (!GAS_URL) return res.status(500).end("GAS_URL belum diset");

  const { action, username, password } = req.body;
  const r = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, username, password })
  });
  const text = await r.text();
  res.status(200).send(text);
}
