const form = document.getElementById("submitForm");
const statusEl = document.getElementById("submitStatus");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Ambil data user dari localStorage
  let userRaw = localStorage.getItem("giveawayUser");
  if (!userRaw) {
    statusEl.textContent = "⛔ Harap login terlebih dahulu!";
    return;
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch (err) {
    statusEl.textContent = "⛔ Data login rusak, silakan login ulang.";
    localStorage.removeItem("giveawayUser");
    return;
  }

  if (!user || !user.username || user.username.trim() === "") {
    statusEl.textContent = "⛔ Harap login kembali!";
    return;
  }

  // Ambil angka dari input
  const numberInput = document.getElementById("numberInput").value.trim();
  const number = parseInt(numberInput, 10);

  if (!numberInput || isNaN(number) || number < 1 || number > 1000) {
    statusEl.textContent = "❌ Masukkan angka 1–1000";
    return;
  }

  // Tampilkan status loading
  statusEl.textContent = "🔄 Mengirim...";

  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        username: user.username.trim(),
        number: number,
      }),
    });

    if (!res.ok) {
      statusEl.textContent = `⚠️ Gagal submit (Kode ${res.status})`;
      return;
    }

    const data = await res.json();

    if (data.success) {
      statusEl.textContent = "✅ " + data.message;
    } else {
      statusEl.textContent = "⚠️ " + (data.error || "Gagal submit");
    }
  } catch (err) {
    console.error("Submit error:", err);
    statusEl.textContent = "🚫 Gagal koneksi ke server!";
  }
});
