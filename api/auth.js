export default async function handler(req, res) {
  const GAS_AUTH_URL = process.env.GAS_AUTH_URL; // GAS endpoint untuk login/register

  if (req.method !== "POST") return res.status(405).send("Only POST allowed");

  try {
    const result = await fetch(GAS_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    const text = await result.text();
    res.status(200).send(text);
  } catch (err) {
    res.status(500).send("Server error");
  }
}
