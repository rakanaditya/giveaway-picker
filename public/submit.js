export async function handleSubmit(e) {
  e.preventDefault();

  const numberInput = document.getElementById("numberInput");
  const submitStatus = document.getElementById("submitStatus");
  const form = document.getElementById("numberForm");

  // Ambil data user dari localStorage
  const userRaw = localStorage.getItem("giveawayUser");

  if (!userRaw || userRaw === "undefined") {
    submitStatus.textContent = "⛔ Harap login terlebih dahulu!";
    return;
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    submitStatus.textContent = "⛔ Data login tidak valid, silakan login ulang.";
    return;
  }

  // Validasi username
  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (!username || username.length < 3) {
    submitStatus.textContent = "⛔ Username kosong atau tidak valid, silakan login ulang.";
    localStorage.removeItem("giveawayUser");
    return;
  }

  // Validasi angka input
  const numberStr = numberInput.value.trim();
  const number = parseInt(numberStr, 10);

  if (!numberStr || isNaN(number) || number < 1 || number > 1000) {
    submitStatus.textContent = "❌ Masukkan angka valid antara 1–1000";
    return;
  }

  submitStatus.textContent = "🔄 Mengirim...";

  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        username,
        number,
      }),
    });

    const text = await res.text();

    try {
      const json = JSON.parse(text);
      if (json.success) {
        submitStatus.textContent = "✅ " + json.message;
        form.style.display = "none";
        numberInput.value = "";
      } else {
        submitStatus.textContent = "⚠️ " + (json.error || json.message || "Gagal submit");
      }
    } catch {
      // Fallback jika bukan JSON
      if (text.toLowerCase().includes("username") || text.toLowerCase().includes("angka")) {
        submitStatus.textContent = "⚠️ Server menolak: Username atau angka kosong.";
      } else {
        submitStatus.textContent = "⚠️ " + text;
      }
    }
  } catch (err) {
    console.error("❌ Submit error:", err);
    submitStatus.textContent = "❌ Terjadi kesalahan saat mengirim.";
  }
}
