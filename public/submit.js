const form = document.getElementById("submitForm");
const statusEl = document.getElementById("submitStatus");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = JSON.parse(localStorage.getItem("giveawayUser"));
  if (!user) {
    statusEl.textContent = "⛔ Harap login terlebih dahulu!";
    return;
  }

  const number = parseInt(document.getElementById("numberInput").value);
  if (isNaN(number) || number < 1 || number > 1000) {
    statusEl.textContent = "❌ Masukkan angka 1–1000";
    return;
  }

  statusEl.textContent = "🔄 Mengirim...";

  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author: { username: user.username },
      content: number
    })
  });

  const text = await res.text();
  if (text === "OK") {
    statusEl.textContent = "✅ Berhasil ikut giveaway!";
  } else {
    statusEl.textContent = "⚠️ " + text;
  }
});
