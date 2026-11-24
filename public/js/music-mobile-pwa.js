/* === 1. SPLASH LOADING & DETEKSI UPDATE OTOMATIS === */
  const CURRENT_APP_VERSION = "v1.0.1"; // Samakan dengan APP_VERSION di sw.js
  const loaderEl = document.getElementById("appLoader");
  const versionTextEl = document.getElementById("appVersionText");
  const updateToast = document.getElementById("updateToast");
  const reloadUpdateBtn = document.getElementById("reloadUpdateBtn");

  if (versionTextEl) {
    versionTextEl.textContent = `Giveaways Picker • ${CURRENT_APP_VERSION}`;
  }

  // Hilangkan layar loading setelah halaman siap
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (loaderEl) loaderEl.classList.add("hidden");
    }, 650);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        // Cek update secara berkala setiap 60 detik saat aplikasi terbuka
        setInterval(() => reg.update(), 60 * 1000);

        // Deteksi jika ada Service Worker versi baru yang selesai terpasang
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              if (updateToast) updateToast.classList.add("show");
            }
          });
        });
      } catch (_) {}
    });

    // Otomatis muat ulang halaman saat pengguna menekan "Perbarui"
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  if (reloadUpdateBtn) {
    reloadUpdateBtn.addEventListener("click", () => {
      window.location.reload();
    });
  }

/* === 2. TOMBOL INSTALL KE LAYAR UTAMA (SELALU TAMPIL DI BROWSER) === */
  let deferredPrompt = null;
  const installBtn = document.getElementById("installAppBtn");
  const iosHint = document.getElementById("iosInstallHint");

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  // Sembunyikan tombol hanya jika sudah dibuka sebagai aplikasi ter-install
  if (installBtn) {
    installBtn.style.display = isStandalone ? "none" : "inline-flex";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn && !isStandalone) {
      installBtn.style.display = "inline-flex";
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (installBtn) installBtn.style.display = "none";
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      // Jika prompt otomatis dari browser tersedia, langsung munculkan
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          installBtn.style.display = "none";
        }
        deferredPrompt = null;
        return;
      }

      // Fallback jika baru saja uninstall (browser menahan prompt otomatis) atau di iOS
      if (isIOS) {
        alert('Cara Install di iPhone/iPad:\n1. Tekan ikon Bagikan (Share) di bawah browser Safari.\n2. Pilih "Tambah ke Layar Utama" (Add to Home Screen).');
      } else {
        alert('Cara Install Aplikasi:\n1. Tekan ikon titik tiga (⋮) di pojok kanan atas browser.\n2. Pilih "Tambahkan ke layar utama" atau "Install aplikasi".');
      }
    });
  }

  if (isIOS && !isStandalone && iosHint) {
    iosHint.style.display = "block";
  }

  
  /* === 3. DETEKSI ONLINE / OFFLINE & SINKRONISASI ANTREAN === */
  const netBadge = document.getElementById("networkStatusBadge");

  async function syncPendingOfflineLinks() {
    if (!navigator.onLine || typeof window.getAllTracksDB !== "function") return;
    const allTracks = await window.getAllTracksDB();
    let updated = false;

    for (const track of allTracks) {
      if (track.pendingSync && (track.type === "spotify" || track.type === "youtube")) {
        try {
          const endpoint =
            track.type === "spotify"
              ? `https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`
              : `https://www.youtube.com/oembed?url=${encodeURIComponent(track.url)}&format=json`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const info = await res.json();
            if (info.title) {
              track.name = info.title;
              track.pendingSync = false;
              await window.updateTrackDB(track);
              updated = true;
            }
          }
        } catch (_) {}
      }
    }

    if (updated && typeof window.refreshPlaylist === "function") {
      await window.refreshPlaylist();
    }
  }

  function updateNetworkUI() {
    if (!netBadge) return;
    if (navigator.onLine) {
      netBadge.textContent = "🟢 Online";
      netBadge.className = "net-badge online";
      syncPendingOfflineLinks();
    } else {
      netBadge.textContent = "🟠 Offline (Lokal Aktif)";
      netBadge.className = "net-badge offline";
    }
  }

  window.addEventListener("online", updateNetworkUI);
  window.addEventListener("offline", updateNetworkUI);

  /* === 4. TOGGLE MODE TAMPILAN: VIDEO vs VISUALIZER === */
  const toggleViewBtn = document.getElementById("toggleVideoBtn");
  const videoEl = document.getElementById("videoPlayer");
  const canvasEl = document.getElementById("c");
  let showVideoMode = true;

  if (toggleViewBtn) {
    toggleViewBtn.addEventListener("click", () => {
      showVideoMode = !showVideoMode;
      toggleViewBtn.textContent = showVideoMode ? "🎬 Mode: Video" : "📊 Mode: Visualizer";

      if (videoEl && videoEl.dataset.hasVideo === "true") {
        videoEl.style.display = showVideoMode ? "block" : "none";
        canvasEl.style.display = showVideoMode ? "none" : "block";
      }
    });
  }

  /* === 5. PENGATURAN UMUM (BACKGROUND, TEMA, VISUALIZER, SLEEP TIMER) === */
  const SETTINGS_KEY = "GP_MUSIC_SETTINGS_V1";
  const DEFAULT_SETTINGS = {
    bgImage: "https://i.imgur.com/53m3Fo5.png",
    applyPageBg: false,
    dimOpacity: 0.65,
    accentColor: "#1db954",
    vizStyle: "bars",
    bassShake: true,
    autoNext: true
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let sleepTimerId = null;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (saved) currentSettings = { ...DEFAULT_SETTINGS, ...saved };
    } catch (_) {}
    applySettingsToUI();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
    } catch (err) {
      alert("Ukuran gambar terlalu besar untuk disimpan di browser. Gunakan gambar di bawah 2MB atau tempel URL gambar.");
    }
    applySettingsToUI();
  }

  function applySettingsToUI() {
    document.documentElement.style.setProperty("--accent", currentSettings.accentColor);

    const stageBox = document.querySelector(".stage-box");
    const dim = currentSettings.dimOpacity;
    const bgCss = currentSettings.bgImage
      ? `linear-gradient(rgba(9, 13, 22, ${dim}), rgba(9, 13, 22, ${Math.min(dim + 0.1, 0.95)})), url("${currentSettings.bgImage}") center/cover no-repeat`
      : "#090d16";

    if (stageBox) {
      stageBox.style.background = bgCss;
    }

    if (currentSettings.applyPageBg && currentSettings.bgImage) {
      document.body.style.background = `linear-gradient(rgba(9, 13, 22, ${dim}), rgba(9, 13, 22, ${Math.min(dim + 0.15, 0.96)})), url("${currentSettings.bgImage}") center/cover fixed no-repeat`;
    } else {
      document.body.style.background = "#090d16";
    }

    // Sinkronkan nilai input di dalam modal pengaturan
    const bgUrlInput = document.getElementById("setBgUrl");
    const applyPageChk = document.getElementById("setApplyPageBg");
    const dimRange = document.getElementById("setDimOpacity");
    const vizSelect = document.getElementById("setVizStyle");
    const shakeChk = document.getElementById("setBassShake");
    const autoNextChk = document.getElementById("setAutoNext");

    if (bgUrlInput) bgUrlInput.value = currentSettings.bgImage.startsWith("data:") ? "" : currentSettings.bgImage;
    if (applyPageChk) applyPageChk.checked = currentSettings.applyPageBg;
    if (dimRange) dimRange.value = currentSettings.dimOpacity;
    if (vizSelect) vizSelect.value = currentSettings.vizStyle;
    if (shakeChk) shakeChk.checked = currentSettings.bassShake;
    if (autoNextChk) autoNextChk.checked = currentSettings.autoNext;

    document.querySelectorAll(".color-dot").forEach((dot) => {
      dot.classList.toggle("active", dot.dataset.color === currentSettings.accentColor);
    });
  }

  function initSettingsModal() {
    const openBtn = document.getElementById("openSettingsBtn");
    const closeBtn = document.getElementById("closeSettingsBtn");
    const modal = document.getElementById("settingsModal");

    if (!openBtn || !modal) return;

    openBtn.addEventListener("click", () => {
      modal.style.display = "flex";
    });

    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });

    // Upload background dari HP/PC
    const bgFileInput = document.getElementById("setBgFile");
    if (bgFileInput) {
      bgFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          currentSettings.bgImage = reader.result;
          saveSettings();
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      });
    }

    // URL Background
    const applyUrlBtn = document.getElementById("applyBgUrlBtn");
    if (applyUrlBtn) {
      applyUrlBtn.addEventListener("click", () => {
        const val = document.getElementById("setBgUrl").value.trim();
        currentSettings.bgImage = val;
        saveSettings();
      });
    }

    // Preset Background
    document.querySelectorAll(".bg-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentSettings.bgImage = btn.dataset.bg;
        saveSettings();
      });
    });

    // Terapkan ke seluruh halaman
    document.getElementById("setApplyPageBg").addEventListener("change", (e) => {
      currentSettings.applyPageBg = e.target.checked;
      saveSettings();
    });

    // Kegelapan Overlay
    document.getElementById("setDimOpacity").addEventListener("input", (e) => {
      currentSettings.dimOpacity = parseFloat(e.target.value);
      saveSettings();
    });

    // Warna Aksen Tema
    document.querySelectorAll(".color-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        currentSettings.accentColor = dot.dataset.color;
        saveSettings();
      });
    });

    // Gaya Visualizer & Shake & AutoNext
    document.getElementById("setVizStyle").addEventListener("change", (e) => {
      currentSettings.vizStyle = e.target.value;
      saveSettings();
    });

    document.getElementById("setBassShake").addEventListener("change", (e) => {
      currentSettings.bassShake = e.target.checked;
      saveSettings();
    });

    document.getElementById("setAutoNext").addEventListener("change", (e) => {
      currentSettings.autoNext = e.target.checked;
      saveSettings();
    });

    // Sleep Timer
    const sleepSelect = document.getElementById("setSleepTimer");
    const sleepStatus = document.getElementById("sleepTimerStatus");
    if (sleepSelect) {
      sleepSelect.addEventListener("change", (e) => {
        clearTimeout(sleepTimerId);
        const mins = parseInt(e.target.value, 10);
        if (!mins) {
          sleepStatus.textContent = "Nonaktif";
          return;
        }
        sleepStatus.textContent = `Aktif (${mins} menit)`;
        sleepTimerId = setTimeout(() => {
          const stopBtn = document.getElementById("stopBtn");
          if (stopBtn) stopBtn.click();
          sleepSelect.value = "0";
          sleepStatus.textContent = "Selesai (Musik dihentikan)";
        }, mins * 60 * 1000);
      });
    }

    // Reset Pengaturan Default
    document.getElementById("resetSettingsBtn").addEventListener("click", () => {
      currentSettings = { ...DEFAULT_SETTINGS };
      saveSettings();
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    updateNetworkUI();
    loadSettings();
    initSettingsModal();
  });

  window.GP_PWA = {
    isVideoMode: () => showVideoMode,
    getSettings: () => currentSettings,
    syncPendingOfflineLinks
  };
})();
