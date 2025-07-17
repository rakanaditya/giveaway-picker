export async function handleSubmit(e) {
  e.preventDefault();

  const numberInput = document.getElementById("numberInput");
  const submitStatus = document.getElementById("submitStatus");
  const form = document.getElementById("numberForm");

  const userRaw = localStorage.getItem("giveawayUser");
  if (!userRaw) {
    submitStatus.textContent = "⛔ Harap login terlebih dahulu!";
    return;
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    submitStatus.textContent = "⛔ Data login rusak, silakan login ulang.";
    return;
  }

  const username = user.username?.trim();
  if (!username) {
    submitStatus.textContent = "⛔ Username kosong, login ulang.";
    return;
  }

  const number = parseInt(numberInput.value.trim(), 10);
  if (isNaN(number) || number < 1 || number > 1000) {
    submitStatus.textContent = "❌ Masukkan angka 1–1000";
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
      if (text === "OK") {
        submitStatus.textContent = "✅ Angka berhasil dikirim!";
        form.style.display = "none";
        numberInput.value = "";
      } else {
        submitStatus.textContent = "⚠️ " + text;
      }
    }
  } catch (err) {
    console.error("❌ Submit error:", err);
    submitStatus.textContent = "❌ Terjadi kesalahan saat mengirim.";
  }
}
