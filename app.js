const STORAGE_KEY = "simple-grocery-list-he-v1";
const LEGACY_KEY = "pantry-household-he-v1";

const defaultItems = [
  item("חלב", "מקרר"),
  item("ביצים", "מקרר"),
  item("חמאה", "מקרר"),
  item("קפה", "מזווה"),
  item("אורז", "מזווה"),
  item("פתיתים", "מזווה"),
  item("שקדי מרק", "מזווה"),
  item("חמאת בוטנים", "מזווה"),
  item("עדשים שחורות", "מזווה"),
  item("תרכיז עגבניות", "מזווה"),
  item("קינמון", "מזווה"),
  item("פתי בר", "חטיפים"),
  item("שוקולד מריר", "חטיפים"),
  item("מסטיק", "חטיפים"),
  item("אפונה וגזר", "קפואים"),
  item("ירקות להקפצה", "קפואים"),
  item("שניצל", "קפואים"),
  item("עוף טחון", "קפואים"),
  item("נייר מגבת", "בית"),
  item("ממחטות אף", "בית"),
  item("מטליות לרצפה", "בית"),
  item("חומר ניקוי כללי", "בית"),
  item("ניקוי אסלה", "בית"),
  item("משחת שיניים", "פארם"),
  item("דאודורנט", "פארם"),
  item("ג׳ל רחצה", "פארם")
];

const state = loadState();
const elements = {
  neededCount: document.querySelector("#neededCount"),
  neededSummary: document.querySelector("#neededSummary"),
  neededList: document.querySelector("#neededList"),
  groceryList: document.querySelector("#groceryList"),
  searchInput: document.querySelector("#searchInput"),
  addForm: document.querySelector("#addForm"),
  newItemInput: document.querySelector("#newItemInput"),
  shareButton: document.querySelector("#shareButton"),
  clearButton: document.querySelector("#clearButton"),
  receiptInput: document.querySelector("#receiptInput"),
  receiptFile: document.querySelector("#receiptFile"),
  learnReceiptButton: document.querySelector("#learnReceiptButton"),
  learnSummary: document.querySelector("#learnSummary"),
  saveStatus: document.querySelector("#saveStatus"),
  toast: document.querySelector("#toast")
};

render();
bindEvents();
registerServiceWorker();

function item(name, category = "כללי", needed = false, note = "") {
  return {
    id: slug(`${category}-${name}`),
    name,
    category,
    needed,
    note,
    purchaseCount: 0,
    lastBoughtAt: ""
  };
}

function loadState() {
  const fromLink = readSharedState();
  if (fromLink) return fromLink;

  const saved = readJson(localStorage.getItem(STORAGE_KEY));
  if (saved?.items?.length) return normalize(saved);

  const legacy = readJson(localStorage.getItem(LEGACY_KEY));
  if (legacy?.items?.length) {
    return normalize({
      items: legacy.items.map((entry) => ({
        id: entry.id || slug(`${entry.category}-${entry.name}`),
        name: entry.name,
        category: entry.category || "כללי",
      note: [entry.brand, entry.packageSize].filter(Boolean).join(" · "),
      purchaseCount: Number(entry.usualQty || 0) || 1,
      lastBoughtAt: entry.lastPurchased || "",
      needed: Boolean(entry.missing || entry.stockQty <= 0 || entry.stockQty < entry.usualQty)
      }))
    });
  }

  return normalize({ items: defaultItems });
}

function normalize(snapshot) {
  const seen = new Set();
  const items = snapshot.items
    .filter((entry) => entry?.name)
    .map((entry) => ({
      id: entry.id || slug(`${entry.category || "כללי"}-${entry.name}`),
      name: String(entry.name).trim(),
      category: String(entry.category || "כללי").trim(),
      needed: Boolean(entry.needed),
      note: String(entry.note || "").trim(),
      purchaseCount: Math.max(0, Number(entry.purchaseCount || 0)),
      lastBoughtAt: String(entry.lastBoughtAt || "").trim()
    }))
    .filter((entry) => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    items,
    search: "",
    updatedAt: snapshot.updatedAt || new Date().toISOString()
  };
}

function bindEvents() {
  elements.groceryList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-id]");
    if (!checkbox) return;
    setNeeded(checkbox.dataset.id, checkbox.checked);
  });

  elements.neededList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    setNeeded(button.dataset.id, false);
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderList();
  });

  elements.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.newItemInput.value.trim();
    if (!name) return;
    addItem(name);
  });

  elements.clearButton.addEventListener("click", () => {
    state.items.forEach((entry) => {
      entry.needed = false;
    });
    saveState("הרשימה נוקתה");
    render();
  });

  elements.shareButton.addEventListener("click", shareList);
  elements.learnReceiptButton.addEventListener("click", learnFromReceipt);
  elements.receiptFile.addEventListener("change", readReceiptFile);
}

function render() {
  renderNeeded();
  renderList();
}

function renderNeeded() {
  const needed = state.items.filter((entry) => entry.needed);
  elements.neededCount.textContent = String(needed.length);
  elements.neededSummary.textContent = needed.length
    ? `${needed.length} מוצרים מחכים ברשימת הקניות.`
    : "אין כרגע מוצרים שסומנו כחסרים.";

  if (!needed.length) {
    elements.neededList.innerHTML = '<div class="empty-needed">מסמנים חסר מהרשימה למטה.</div>';
    return;
  }

  elements.neededList.innerHTML = needed
    .map(
      (entry) => `
        <div class="needed-item">
          <span>${escapeHtml(entry.name)}</span>
          <button type="button" data-id="${escapeHtml(entry.id)}">נקנה</button>
        </div>
      `
    )
    .join("");
}

function renderList() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.items.filter((entry) => {
    const haystack = `${entry.name} ${entry.category} ${entry.note}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!filtered.length) {
    elements.groceryList.innerHTML = '<div class="empty-list">לא מצאתי מוצר כזה.</div>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    if (a.needed !== b.needed) return a.needed ? -1 : 1;
    return b.purchaseCount - a.purchaseCount || a.name.localeCompare(b.name, "he");
  });
  const groups = groupBy(sorted, (entry) => entry.category);
  elements.groceryList.innerHTML = [...groups.entries()]
    .map(([category, entries]) => {
      const rows = entries
        .map((entry) => {
          const meta = [
            entry.note,
            entry.purchaseCount ? `נקנה ${entry.purchaseCount} פעמים` : "",
            entry.lastBoughtAt ? `עודכן ${formatDate(entry.lastBoughtAt)}` : ""
          ]
            .filter(Boolean)
            .join(" · ");

          return `
            <label class="grocery-row ${entry.needed ? "is-needed" : ""}">
              <input type="checkbox" data-id="${escapeHtml(entry.id)}" ${entry.needed ? "checked" : ""} />
              <span class="check-ui" aria-hidden="true"></span>
              <span class="item-copy">
                <strong>${escapeHtml(entry.name)}</strong>
                ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
              </span>
              <span class="row-state">${entry.needed ? "חסר" : "יש"}</span>
            </label>
          `;
        })
        .join("");

      return `
        <section class="category-group">
          <h3>${escapeHtml(category)}</h3>
          ${rows}
        </section>
      `;
    })
    .join("");
}

function setNeeded(id, needed) {
  const entry = state.items.find((candidate) => candidate.id === id);
  if (!entry) return;
  entry.needed = needed;
  saveState(needed ? "סומן כחסר" : "סומן כנקנה");
  render();
}

function addItem(name) {
  const existing = state.items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.needed = true;
    saveState("סומן כחסר");
    elements.newItemInput.value = "";
    render();
    return;
  }

  state.items.unshift(item(name, guessCategory(name), true));
  elements.newItemInput.value = "";
  saveState("נוסף לרשימה");
  render();
}

function learnFromReceipt() {
  const text = elements.receiptInput.value.trim();
  if (!text) {
    toast("מדביקים קודם טקסט של קבלה.");
    return;
  }

  const names = extractReceiptItems(text);
  if (!names.length) {
    toast("לא מצאתי מוצרים בקבלה.");
    return;
  }

  const result = rememberPurchasedItems(names);
  elements.receiptInput.value = "";
  elements.learnSummary.textContent = `נלמדו ${result.learned} מוצרים, ${result.added} חדשים.`;
  saveState(`למדתי ${result.learned} מוצרים`);
  render();
}

function readReceiptFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    elements.receiptInput.value = String(reader.result || "");
    toast("טקסט הקבלה נטען.");
  };
  reader.onerror = () => toast("לא הצלחתי לקרוא את הקובץ.");
  reader.readAsText(file);
  event.target.value = "";
}

function rememberPurchasedItems(names) {
  let learned = 0;
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);

  names.forEach((name) => {
    const match = findSimilarItem(name);
    if (match) {
      match.purchaseCount += 1;
      match.lastBoughtAt = today;
      match.needed = false;
      learned += 1;
      return;
    }

    const entry = item(name, guessCategory(name), false);
    entry.purchaseCount = 1;
    entry.lastBoughtAt = today;
    state.items.push(entry);
    learned += 1;
    added += 1;
  });

  return { learned, added };
}

function extractReceiptItems(text) {
  const blocked = [
    "סהכ",
    "סה״כ",
    "לתשלום",
    "חשבונית",
    "קבלה",
    "הזמנה",
    "משלוח",
    "עמוד",
    "תאריך",
    "שעה",
    "אשראי",
    "מע״מ",
    "מעמ",
    "ברקוד",
    "מק״ט",
    "מקט",
    "ויקטורי"
  ];
  const seen = new Set();

  return text
    .split(/\r?\n/)
    .map(cleanReceiptLine)
    .filter((line) => line.length >= 3 && /[\u0590-\u05ff]/.test(line))
    .filter((line) => !blocked.some((word) => simplify(line).includes(simplify(word))))
    .filter((line) => {
      const key = simplify(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

function cleanReceiptLine(line) {
  return String(line)
    .replace(/[₪$]/g, " ")
    .replace(/\b\d+[.,]\d{1,2}\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b\d+\s*(יח|גרם|קג|ק״ג|מל|מ״ל|ליטר|%)\b/g, " ")
    .replace(/[*#|:]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findSimilarItem(name) {
  const key = simplify(name);
  return state.items.find((entry) => {
    const candidate = simplify(entry.name);
    return candidate === key || candidate.includes(key) || key.includes(candidate);
  });
}

function guessCategory(name) {
  const value = simplify(name);
  if (/חלב|גבינ|יוגורט|ביצ|חמאה|שמנת/.test(value)) return "מקרר";
  if (/שניצל|עוף|בשר|דג|קפוא|אפונה|ירקות/.test(value)) return "קפואים";
  if (/נייר|מטליות|ניקוי|אסלה|סבון|כביסה|אקונומיקה/.test(value)) return "בית";
  if (/משחה|דאודורנט|שמפו|רחצה|ממחטות/.test(value)) return "פארם";
  if (/שוקולד|חטיף|עוגי|מסטיק|פתי/.test(value)) return "חטיפים";
  return "מזווה";
}

function simplify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[״׳'"]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return [day, month, year].filter(Boolean).join(".");
}

async function shareList() {
  const needed = state.items.filter((entry) => entry.needed);
  const lines = needed.length
    ? ["רשימת קניות", ...needed.map((entry) => `• ${entry.name}`)]
    : ["רשימת קניות", "אין כרגע מוצרים שסומנו כחסרים."];
  const text = lines.join("\n");
  const url = makeShareUrl();

  if (navigator.share) {
    try {
      await navigator.share({ title: "קניות לבית", text, url });
      return;
    } catch {
      // המשתמש ביטל את השיתוף.
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("הקישור והרשימה הועתקו.");
  } catch {
    toast("לא הצלחתי לשתף כרגע.");
  }
}

function makeShareUrl() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ items: state.items }))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${window.location.origin}${window.location.pathname}#list=${payload}`;
}

function readSharedState() {
  const match = window.location.hash.match(/^#list=(.+)$/);
  if (!match) return null;

  try {
    const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const parsed = JSON.parse(decodeURIComponent(escape(atob(padded))));
    if (!parsed?.items?.length) return null;
    const normalized = normalize(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return normalized;
  } catch {
    return null;
  }
}

function saveState(message) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  elements.saveStatus.textContent = message || "נשמר במכשיר";
  window.setTimeout(() => {
    elements.saveStatus.textContent = "נשמר במכשיר";
  }, 1200);
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 1800);
}

function groupBy(items, getKey) {
  const map = new Map();
  items.forEach((entry) => {
    const key = getKey(entry);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  });
  return map;
}

function readJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    if (["127.0.0.1", "localhost"].includes(window.location.hostname)) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      return;
    }

    navigator.serviceWorker.register("./service-worker.js?v=agent-list-1").catch(() => undefined);
  });
}
