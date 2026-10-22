/* Desk Buddy — optional status-bar pets for Lark (local SVG, no network). */
(function (global) {
  const SPECIES = [
    ["cat", "Cat"],
    ["crab", "Crab"],
    ["turtle", "Turtle"],
    ["elephant", "Elephant"],
    ["dog", "Dog"],
    ["shark", "Shark"],
    ["horse", "Horse"],
    ["cheetah", "Cheetah"]
  ];

  const SVG = {
    cat: '<ellipse cx="22" cy="20" rx="14" ry="7" fill="#c4a574"/><ellipse cx="14" cy="14" rx="7" ry="6" fill="#c4a574"/><polygon class="ear" points="9,10 11,3 15,9" fill="#c4a574"/><polygon points="13,9 17,2 20,10" fill="#b08d5a"/><circle cx="12" cy="13" r="1.1" fill="#2b2b2b"/><circle cx="16.5" cy="13" r="1.1" fill="#2b2b2b"/><path d="M10 16 q4 2 8 0" stroke="#2b2b2b" stroke-width="0.8" fill="none"/><path class="tail" d="M34 18 q8 -10 6 -16" stroke="#c4a574" stroke-width="3" fill="none" stroke-linecap="round"/>',
    crab: '<ellipse cx="22" cy="18" rx="12" ry="8" fill="#d45a3a"/><circle cx="16" cy="15" r="1.2" fill="#2b2b2b"/><circle cx="28" cy="15" r="1.2" fill="#2b2b2b"/><path d="M8 14 q-6 -8 2 -10" stroke="#d45a3a" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M36 14 q6 -8 -2 -10" stroke="#d45a3a" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M10 22 l-4 5M14 23 l-2 5M30 23 l2 5M34 22 l4 5" stroke="#b8462c" stroke-width="1.6" stroke-linecap="round"/><path class="claw" d="M6 6 q-2 4 3 5" stroke="#d45a3a" stroke-width="2" fill="none"/>',
    turtle: '<ellipse cx="22" cy="18" rx="13" ry="8" fill="#5f8f6a"/><ellipse cx="22" cy="17" rx="9" ry="5.5" fill="#4a7354"/><ellipse cx="8" cy="18" rx="4" ry="3" fill="#6a9a74"/><ellipse cx="36" cy="20" rx="3.5" ry="2.5" fill="#6a9a74"/><circle cx="6" cy="17" r="0.9" fill="#2b2b2b"/><path class="tail" d="M35 18 q6 2 7 6" stroke="#5f8f6a" stroke-width="2" fill="none" stroke-linecap="round"/>',
    elephant: '<ellipse cx="20" cy="18" rx="12" ry="8" fill="#9aa3ad"/><circle cx="10" cy="14" r="6" fill="#9aa3ad"/><circle cx="8" cy="13" r="1" fill="#2b2b2b"/><path class="trunk" d="M5 16 q-4 6 0 10" stroke="#8a93a0" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 9 l-2 -5M16 9 l1 -5" stroke="#9aa3ad" stroke-width="2" stroke-linecap="round"/><path class="tail" d="M31 16 q8 -4 10 2" stroke="#9aa3ad" stroke-width="2" fill="none"/>',
    dog: '<ellipse cx="22" cy="19" rx="13" ry="7" fill="#c49a6c"/><ellipse cx="12" cy="14" rx="6" ry="5" fill="#c49a6c"/><ellipse cx="7" cy="12" rx="2.5" ry="4" fill="#a67c52"/><circle cx="11" cy="13" r="1" fill="#2b2b2b"/><circle cx="15" cy="14" r="0.7" fill="#5a3a22"/><path class="tail" d="M34 16 q6 -10 2 -14" stroke="#c49a6c" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M18 22 l3 4M24 22 l-2 4" stroke="#a67c52" stroke-width="1.5"/>',
    shark: '<ellipse cx="22" cy="16" rx="15" ry="6" fill="#6b8cae"/><polygon points="22,6 26,14 18,14" fill="#5a7a9a"/><polygon class="tail" points="36,16 44,10 44,22" fill="#6b8cae"/><circle cx="12" cy="15" r="1.1" fill="#2b2b2b"/><path d="M8 18 q6 3 14 0" stroke="#4a6a88" stroke-width="1" fill="none"/>',
    horse: '<ellipse cx="22" cy="18" rx="13" ry="7" fill="#8b6914"/><ellipse cx="10" cy="13" rx="5" ry="4.5" fill="#8b6914"/><path d="M7 10 q-1 -6 4 -5" stroke="#6b5010" stroke-width="2" fill="none"/><circle cx="9" cy="12" r="0.9" fill="#2b2b2b"/><path class="tail" d="M34 16 q8 2 6 10" stroke="#5a4010" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M16 23 v5M26 23 v5" stroke="#6b5010" stroke-width="1.8"/>',
    cheetah: '<ellipse cx="22" cy="18" rx="14" ry="6.5" fill="#d2a54a"/><ellipse cx="11" cy="14" rx="5.5" ry="4.5" fill="#d2a54a"/><circle cx="10" cy="13" r="0.9" fill="#2b2b2b"/><circle cx="14" cy="14" r="0.7" fill="#5a3a10"/><g fill="#5a3a10"><circle cx="18" cy="16" r="0.7"/><circle cx="24" cy="15" r="0.7"/><circle cx="28" cy="17" r="0.7"/><circle cx="20" cy="19" r="0.6"/></g><path class="tail" d="M35 16 q9 -8 7 -14" stroke="#d2a54a" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
  };

  let root = null;
  let el = null;
  let moodTimer = null;
  let enabled = false;
  let species = "cat";

  function loadPrefs() {
    try {
      enabled = localStorage.getItem("lark-buddy") === "1";
      const sp = localStorage.getItem("lark-buddy-species") || "cat";
      species = SVG[sp] ? sp : "cat";
    } catch (e) {
      enabled = false;
      species = "cat";
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem("lark-buddy", enabled ? "1" : "0");
      localStorage.setItem("lark-buddy-species", species);
    } catch (e) {}
  }

  function mount(statusEl) {
    if (!statusEl) return;
    loadPrefs();
    root = statusEl;
    root.classList.add("has-buddy-lane");
    let lane = root.querySelector(".buddy-lane");
    if (!lane) {
      lane = document.createElement("div");
      lane.className = "buddy-lane";
      lane.setAttribute("aria-hidden", "true");
      root.insertBefore(lane, root.firstChild);
    }
    el = document.createElement("div");
    el.className = "desk-buddy walk";
    el.title = "Desk Buddy";
    lane.appendChild(el);
    render();
    applyEnabled();
  }

  function render() {
    if (!el) return;
    const body = SVG[species] || SVG.cat;
    el.innerHTML = '<svg viewBox="0 0 44 28" width="44" height="28" aria-hidden="true">' + body + "</svg>";
    el.dataset.species = species;
  }

  function applyEnabled() {
    if (!el) return;
    el.style.display = enabled ? "block" : "none";
    const lane = root && root.querySelector(".buddy-lane");
    if (lane) lane.style.display = enabled ? "block" : "none";
  }

  function setEnabled(on) {
    enabled = !!on;
    savePrefs();
    applyEnabled();
  }

  function setSpecies(id) {
    if (!SVG[id]) return;
    species = id;
    savePrefs();
    render();
  }

  function setMood(name) {
    if (!el || !enabled) return;
    el.classList.remove("celebrate", "sad", "walk");
    if (name === "celebrate") el.classList.add("celebrate");
    else if (name === "sad") el.classList.add("sad");
    else el.classList.add("walk");
    clearTimeout(moodTimer);
    if (name !== "idle" && name !== "walk") {
      moodTimer = setTimeout(() => setMood("walk"), 1600);
    }
  }

  function celebrate() { setMood("celebrate"); }
  function sad() { setMood("sad"); }

  function syncUi() {
    const on = document.getElementById("setting-buddy");
    const sel = document.getElementById("setting-buddy-species");
    if (on) on.checked = enabled;
    if (sel) {
      if (!sel.options.length) {
        SPECIES.forEach(([id, label]) => {
          const opt = document.createElement("option");
          opt.value = id;
          opt.textContent = label;
          sel.appendChild(opt);
        });
      }
      sel.value = species;
      sel.disabled = !enabled;
    }
  }

  global.LarkBuddy = {
    SPECIES: SPECIES,
    mount: mount,
    setEnabled: setEnabled,
    setSpecies: setSpecies,
    isEnabled: function () { return enabled; },
    species: function () { return species; },
    celebrate: celebrate,
    sad: sad,
    syncUi: syncUi,
    loadPrefs: loadPrefs
  };
})(window);
