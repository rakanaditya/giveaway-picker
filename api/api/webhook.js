export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_WEBHOOK_URL;

  if (req.method !== "POST") return res.status(405).end();

  const { author, content } = req.body;

  if (!author || !content) return res.status(400).json({ error: "Missing data" });

  const body = {
    username: author.username,
    message: content
  };

  await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  res.status(200).json({ status: "OK" });
}
