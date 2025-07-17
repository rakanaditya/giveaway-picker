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
    action: "submit",
    username: user.username,
    number: number   // ✅
  })
});


const data = await res.json();
if (data.success) {
  statusEl.textContent = "✅ " + data.message;
} else {
  statusEl.textContent = "⚠️ " + (data.error || "Gagal submit");
}

});
