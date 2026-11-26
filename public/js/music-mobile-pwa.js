(function () {
  /* === 1. DETEKSI & NOTIFIKASI UPDATE OTOMATIS === */
  const CURRENT_APP_VERSION = "v1.0.2";
  const STORAGE_VER_KEY = "GP_MUSIC_INSTALLED_VER";
  const updateToast = document.getElementById("updateToast");
  const updateVersionLabel = document.getElementById("updateVersionLabel");
  const closeUpdateToastBtn = document.getElementById("closeUpdateToastBtn");

  function showUpdatedNotification(version) {
    if (!updateToast) return;
    if (updateVersionLabel) {
      updateVersionLabel.textContent = `App Version: ${version}`;
    }
    updateToast.classList.add("show");
    setTimeout(() => {
      updateToast.classList.remove("show");
    }, 6000);
  }

  if (closeUpdateToastBtn && updateToast) {
    closeUpdateToastBtn.addEventListener("click", () => {
      updateToast.classList.remove("show");
    });
  }

  const lastSeenVersion = localStorage.getItem(STORAGE_VER_KEY);
  if (lastSeenVersion && lastSeenVersion !== CURRENT_APP_VERSION) {
    window.addEventListener("DOMContentLoaded", () => {
      showUpdatedNotification(CURRENT_APP_VERSION);
    });
  }
  localStorage.setItem(STORAGE_VER_KEY, CURRENT_APP_VERSION);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        reg.update();
      } catch (_) {}
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
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
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          installBtn.style.display = "none";
        }
        deferredPrompt = null;
        return;
      }

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

  /* === HELPER PENYIMPANAN BACKGROUND VIDEO DI INDEXEDDB === */
  const BG_DB_NAME = "GP_Music_CustomBg_DB";
  const BG_STORE = "bg_media";

  function openBgDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BG_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BG_STORE)) {
          db.createObjectStore(BG_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveBgBlob(blob) {
    const db = await openBgDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, "readwrite");
      tx.objectStore(BG_STORE).put(blob, "active_bg_video");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getBgBlob() {
    const db = await openBgDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BG_STORE, "readonly");
      const req = tx.objectStore(BG_STORE).get("active_bg_video");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async function clearBgBlob() {
    const db = await openBgDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BG_STORE, "readwrite");
      tx.objectStore(BG_STORE).delete("active_bg_video");
      tx.oncomplete = () => resolve();
    });
  }

  function isVideoBgSource(src) {
    if (!src) return false;
    return (
      src === "indexeddb:video" ||
      /^data:video\//i.test(src) ||
      /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(src)
    );
  }

  /* === 5. PENGATURAN UMUM (BACKGROUND GAMBAR & VIDEO, TEMA, VISUALIZER, SLEEP TIMER) === */
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
  let activeBgBlobUrl = null;
  let lastAppliedBgKey = "";

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
      alert("Ukuran gambar terlalu besar untuk disimpan di browser. Gunakan file di bawah 2MB atau tempel URL media.");
    }
    applySettingsToUI();
  }

  function removeDynamicBgVideo() {
    const oldVid = document.getElementById("gpDynamicBgVideo");
    const oldOverlay = document.getElementById("gpDynamicBgOverlay");
    if (oldVid) oldVid.remove();
    if (oldOverlay) oldOverlay.remove();
    if (activeBgBlobUrl) {
      URL.revokeObjectURL(activeBgBlobUrl);
      activeBgBlobUrl = null;
    }
    lastAppliedBgKey = "";
  }

  async function renderVideoBackground(targetContainer, isFullScreen, dim) {
    const bgStateKey = `${currentSettings.bgImage}|${isFullScreen}`;
    let vid = document.getElementById("gpDynamicBgVideo");
    let overlay = document.getElementById("gpDynamicBgOverlay");

    if (!vid || vid.parentElement !== targetContainer || lastAppliedBgKey !== bgStateKey) {
      removeDynamicBgVideo();
      lastAppliedBgKey = bgStateKey;

      let finalVideoSrc = currentSettings.bgImage;
      if (currentSettings.bgImage === "indexeddb:video") {
        const blob = await getBgBlob();
        if (!blob) return;
        activeBgBlobUrl = URL.createObjectURL(blob);
        finalVideoSrc = activeBgBlobUrl;
      }

      if (!isFullScreen && getComputedStyle(targetContainer).position === "static") {
        targetContainer.style.position = "relative";
      }

      vid = document.createElement("video");
      vid.id = "gpDynamicBgVideo";
      vid.src = finalVideoSrc;
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.style.cssText = isFullScreen
        ? "position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:-2;pointer-events:none;"
        : "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;border-radius:inherit;";

      overlay = document.createElement("div");
      overlay.id = "gpDynamicBgOverlay";
      overlay.style.cssText = isFullScreen
        ? "position:fixed;inset:0;z-index:-1;pointer-events:none;"
        : "position:absolute;inset:0;z-index:0;pointer-events:none;border-radius:inherit;";

      targetContainer.prepend(overlay);
      targetContainer.prepend(vid);
      vid.play().catch(() => {});
    }

    if (overlay) {
      overlay.style.background = `linear-gradient(rgba(9, 13, 22, ${dim}), rgba(9, 13, 22, ${Math.min(dim + 0.12, 0.96)}))`;
    }
  }

  async function applySettingsToUI() {
    document.documentElement.style.setProperty("--accent", currentSettings.accentColor);

    const stageBox = document.querySelector(".stage-box");
    const dim = currentSettings.dimOpacity;
    const isVideoBg = isVideoBgSource(currentSettings.bgImage);

    if (isVideoBg && currentSettings.bgImage) {
      if (stageBox) stageBox.style.background = "#090d16";
      document.body.style.background = "#090d16";

      const targetBox = currentSettings.applyPageBg ? document.body : stageBox;
      if (targetBox) {
        await renderVideoBackground(targetBox, currentSettings.applyPageBg, dim);
      }
    } else {
      removeDynamicBgVideo();
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
    }

    // Sinkronkan nilai input di dalam modal pengaturan
    const bgUrlInput = document.getElementById("setBgUrl");
    const applyPageChk = document.getElementById("setApplyPageBg");
    const dimRange = document.getElementById("setDimOpacity");
    const vizSelect = document.getElementById("setVizStyle");
    const shakeChk = document.getElementById("setBassShake");
    const autoNextChk = document.getElementById("setAutoNext");

    if (bgUrlInput) {
      const hideVal =
        currentSettings.bgImage.startsWith("data:") || currentSettings.bgImage === "indexeddb:video";
      bgUrlInput.value = hideVal ? "" : currentSettings.bgImage;
    }
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

    // Upload background Gambar atau Video (MP4/WEBM/MOV/M4V) dari HP/PC
    const bgFileInput = document.getElementById("setBgFile");
    if (bgFileInput) {
      bgFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const isVideoFile =
          file.type.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(file.name);

        if (isVideoFile) {
          await saveBgBlob(file);
          currentSettings.bgImage = "indexeddb:video";
          saveSettings();
        } else {
          await clearBgBlob();
          const reader = new FileReader();
          reader.onload = () => {
            currentSettings.bgImage = reader.result;
            saveSettings();
          };
          reader.readAsDataURL(file);
        }
        e.target.value = "";
      });
    }

    // URL Background (mendukung link .jpg, .png, .webp, .gif maupun .mp4/.webm)
    const applyUrlBtn = document.getElementById("applyBgUrlBtn");
    if (applyUrlBtn) {
      applyUrlBtn.addEventListener("click", async () => {
        const val = document.getElementById("setBgUrl").value.trim();
        await clearBgBlob();
        currentSettings.bgImage = val;
        saveSettings();
      });
    }

    // Preset Background
    document.querySelectorAll(".bg-preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await clearBgBlob();
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
    document.getElementById("resetSettingsBtn").addEventListener("click", async () => {
      await clearBgBlob();
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
