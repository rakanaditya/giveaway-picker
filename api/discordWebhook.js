export default async function handler(req, res) {
  const body = req.body;
  if (body?.content && body?.author) {
    const GAS_URL = "https://script.google.com/macros/s/YOUR_GAS_ID/exec"; // ⬅️ GANTI

    await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        username: body.author.username,
        message: body.content,
      }),
      headers: { "Content-Type": "application/json" },
    });
  }

  res.status(200).send("OK");
}
