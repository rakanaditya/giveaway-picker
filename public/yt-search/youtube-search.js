(function () {
  const DB_NAME = "GiveawayMusicPWA_DB";
  const STORE_NAME = "playlist";
  const FOLDERS_KEY = "gp_custom_folders_v1";

  let debounceTimer = null;
  let pendingVideoToSave = null;

  function openPlaylistDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveYoutubeTrackToDB(videoItem, targetFolderId = null) {
    const db = await openPlaylistDB();
    const record = {
      name: videoItem.title,
      type: "youtube",
      videoId: videoItem.videoId,
      thumbnail: videoItem.thumbnail,
      url: videoItem.url,
      pendingSync: false
    };
    if (targetFolderId) {
      record.folderId = targetFolderId;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (typeof window.refreshPlaylist === "function") {
      await window.refreshPlaylist();
    }
  }

  function getCustomFolders() {
    try {
      return JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveCustomFolders(list) {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(list));
  }

  function ensureFolderPickerModal() {
    let backdrop = document.getElementById("ytFolderModalBackdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "ytFolderModalBackdrop";
    backdrop.className = "yt-folder-modal-backdrop";
    backdrop.innerHTML = `
      <div class="yt-folder-modal">
        <h4>📁 Simpan ke Folder Playlist</h4>
        <p id="ytSelectedVideoTitle"></p>
        <div class="yt-folder-list" id="ytFolderChoiceList"></div>
        <div class="yt-new-folder-row">
          <input type="text" id="ytQuickNewFolderInput" placeholder="Atau buat folder baru..." maxlength="32" />
          <button type="button" id="ytQuickCreateFolderBtn">+ Buat & Simpan</button>
        </div>
        <button type="button" class="yt-modal-cancel" id="ytCancelFolderModalBtn">Batal</button>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.remove("open");
    });

    document.getElementById("ytCancelFolderModalBtn").addEventListener("click", () => {
      backdrop.classList.remove("open");
      pendingVideoToSave = null;
    });

    document.getElementById("ytQuickCreateFolderBtn").addEventListener("click", async () => {
      if (!pendingVideoToSave) return;
      const input = document.getElementById("ytQuickNewFolderInput");
      const name = input.value.trim();
      if (!name) return;

      const folders = getCustomFolders();
      const newFolder = {
        id: "fld_" + Date.now(),
        name: name.slice(0, 32)
      };
      folders.push(newFolder);
      saveCustomFolders(folders);

      await saveYoutubeTrackToDB(pendingVideoToSave, newFolder.id);
      input.value = "";
      backdrop.classList.remove("open");
      alert(`✅ "${pendingVideoToSave.title}" disimpan ke folder "${newFolder.name}"!`);
      pendingVideoToSave = null;
    });

    return backdrop;
  }

  function openFolderSelectionModal(videoItem) {
    pendingVideoToSave = videoItem;
    const backdrop = ensureFolderPickerModal();
    document.getElementById("ytSelectedVideoTitle").textContent = videoItem.title;

    const listEl = document.getElementById("ytFolderChoiceList");
    const folders = getCustomFolders();

    let html = `
      <button type="button" class="yt-folder-choice" data-folder-id="">
        <span>📂 Semua Media (Tanpa Folder Khusus)</span>
        <span>+</span>
      </button>
    `;

    folders.forEach((f) => {
      html += `
        <button type="button" class="yt-folder-choice" data-folder-id="${f.id}">
          <span>📁 ${f.name}</span>
          <span>+</span>
        </button>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll(".yt-folder-choice").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!pendingVideoToSave) return;
        const folderId = btn.dataset.folderId || null;
        const folderLabel = btn.querySelector("span").textContent;
        await saveYoutubeTrackToDB(pendingVideoToSave, folderId);
        backdrop.classList.remove("open");
        alert(`✅ "${pendingVideoToSave.title}" ditambahkan ke ${folderLabel}!`);
        pendingVideoToSave = null;
      });
    });

    backdrop.classList.add("open");
  }

  async function executeYoutubeSearch(query) {
    const dropdown = document.getElementById("ytSearchDropdown");
    const listWrap = document.getElementById("ytSearchResultsList");
    const searchBtn = document.getElementById("ytSearchSubmitBtn");
    if (!dropdown || !listWrap) return;

    if (!query.trim()) {
      dropdown.classList.remove("open");
      return;
    }

    dropdown.classList.add("open");
    listWrap.innerHTML = `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:0.85rem;">⏳ Mencari video YouTube...</div>`;
    if (searchBtn) searchBtn.disabled = true;

    try {
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(query.trim())}&limit=10`);
      const data = await res.json();
      const items = data.results || [];

      if (!items.length) {
        listWrap.innerHTML = `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:0.85rem;">Tidak ada hasil video ditemukan.</div>`;
        return;
      }

      listWrap.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "yt-result-item";
        row.innerHTML = `
          <div class="yt-thumb-wrap">
            <img src="${item.thumbnail}" alt="" loading="lazy" />
            ${item.duration ? `<span class="yt-dur-badge">${item.duration}</span>` : ""}
          </div>
          <div class="yt-result-meta">
            <div class="yt-result-title" title="${item.title.replace(/"/g, "&quot;")}">${item.title}</div>
            <div class="yt-result-channel">${item.channel}</div>
          </div>
          <button type="button" class="yt-add-btn" title="Tambah ke Folder Playlist">+</button>
        `;

        row.querySelector(".yt-add-btn").addEventListener("click", () => {
          openFolderSelectionModal(item);
        });

        listWrap.appendChild(row);
      });
    } catch (err) {
      listWrap.innerHTML = `<div style="padding:14px;text-align:center;color:#f87171;font-size:0.85rem;">Gagal memuat hasil: ${err.message}</div>`;
    } finally {
      if (searchBtn) searchBtn.disabled = false;
    }
  }

  function initYoutubeSearchWidget() {
    const inputEl = document.getElementById("ytSearchInput");
    const submitBtn = document.getElementById("ytSearchSubmitBtn");
    const closeBtn = document.getElementById("ytCloseDropdownBtn");
    const dropdown = document.getElementById("ytSearchDropdown");

    if (!inputEl) return;

    inputEl.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const val = inputEl.value.trim();
      if (!val) {
        dropdown?.classList.remove("open");
        return;
      }
      debounceTimer = setTimeout(() => {
        executeYoutubeSearch(val);
      }, 500);
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(debounceTimer);
        executeYoutubeSearch(inputEl.value);
      }
    });

    submitBtn?.addEventListener("click", () => {
      clearTimeout(debounceTimer);
      executeYoutubeSearch(inputEl.value);
    });

    closeBtn?.addEventListener("click", () => {
      dropdown?.classList.remove("open");
    });
  }

  window.addEventListener("DOMContentLoaded", initYoutubeSearchWidget);
})();
