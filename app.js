const STORAGE_KEY = "simple-grocery-list-he-v1";
const LEGACY_KEY = "pantry-household-he-v1";
const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
const TESSERACT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

let pdfJsPromise = null;
let tesseractPromise = null;

const defaultItems = [
  item("חלב", "מקרר", false, "תנובה 3% · 1 ליטר"),
  item("ביצים", "מקרר", false, "גודל L · 12 יחידות"),
  item("חמאה", "מקרר", false, "תנובה · 100 גרם"),
  item("קפה", "מזווה", false, "עלית נמס · 200 גרם"),
  item("אורז", "מזווה", false, "סוגת פרסי · 1 ק״ג"),
  item("פתיתים", "מזווה", false, "אסם אפויים · 500 גרם"),
  item("שקדי מרק", "מזווה", false, "אסם · 400 גרם"),
  item("חמאת בוטנים", "מזווה", false, "בטר & דיפרנט טבעית · 1 ק״ג"),
  item("עדשים שחורות", "מזווה", false, "סוגת · 500 גרם"),
  item("תרכיז עגבניות", "מזווה", false, "פריניר · 260 גרם"),
  item("קינמון", "מזווה", false, "תבליני מימון טחון · 80 גרם"),
  item("פתי בר", "חטיפים", false, "אסם · 500 גרם"),
  item("שוקולד מריר", "חטיפים", false, "עלית 60% · 100 גרם"),
  item("מסטיק", "חטיפים", false, "MUST ללא סוכר · מארז"),
  item("אפונה וגזר", "קפואים", false, "סנפרוסט · 800 גרם"),
  item("ירקות להקפצה", "קפואים", false, "סנפרוסט · 800 גרם"),
  item("שניצל", "קפואים", false, "מאמא עוף · 700 גרם"),
  item("עוף טחון", "קפואים", false, "טרי · 500 גרם"),
  item("נייר מגבת", "בית", false, "סנו סושי · 6 גלילים"),
  item("ממחטות אף", "בית", false, "קלינקס · 3 קופסאות"),
  item("מטליות לרצפה", "בית", false, "סנו סושי · 10 יחידות"),
  item("חומר ניקוי כללי", "בית", false, "סנו רב שימושי · 1 ליטר"),
  item("ניקוי אסלה", "בית", false, "סנו 00 · 750 מ״ל"),
  item("משחת שיניים", "פארם", false, "קולגייט טוטאל · 75 מ״ל"),
  item("דאודורנט", "פארם", false, "ג׳ילט Cool Wave · 70 מ״ל"),
  item("ג׳ל רחצה", "פארם", false, "פלמוליב מינרל · 750 מ״ל")
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
  clearButton: document.querySelector("#clearButton"),
  receiptInput: document.querySelector("#receiptInput"),
  receiptFile: document.querySelector("#receiptFile"),
  receiptCamera: document.querySelector("#receiptCamera"),
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
  if (fromLink) return withDefaultDetails(fromLink);

  const saved = readJson(localStorage.getItem(STORAGE_KEY));
  if (saved?.items?.length) return withDefaultDetails(normalize(saved));

  const legacy = readJson(localStorage.getItem(LEGACY_KEY));
  if (legacy?.items?.length) {
    return withDefaultDetails(normalize({
      items: legacy.items.map((entry) => ({
        id: entry.id || slug(`${entry.category}-${entry.name}`),
        name: entry.name,
        category: entry.category || "כללי",
        note: [entry.brand, entry.packageSize].filter(Boolean).join(" · "),
        purchaseCount: Number(entry.usualQty || 0) || 1,
        lastBoughtAt: entry.lastPurchased || "",
        needed: Boolean(entry.missing || entry.stockQty <= 0 || entry.stockQty < entry.usualQty)
      }))
    }));
  }

  return normalize({ items: defaultItems });
}

function withDefaultDetails(snapshot) {
  const detailByName = new Map(defaultItems.map((entry) => [simplify(entry.name), entry]));

  return {
    ...snapshot,
    items: snapshot.items.map((entry) => {
      const defaultEntry = detailByName.get(simplify(entry.name));
      if (!defaultEntry) return entry;
      return {
        ...entry,
        category: entry.category || defaultEntry.category,
        note: entry.note || defaultEntry.note
      };
    })
  };
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

  elements.learnReceiptButton.addEventListener("click", learnFromReceipt);
  elements.receiptFile.addEventListener("change", readReceiptFile);
  elements.receiptCamera.addEventListener("change", scanReceiptImage);
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
          <span class="needed-copy">
            <strong>${escapeHtml(entry.name)}</strong>
            ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
          </span>
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

  if (learnFromReceiptText(text, "לא מצאתי מוצרים בקבלה.")) elements.receiptInput.value = "";
}

async function readReceiptFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!isSupportedReceiptFile(file)) {
    toast("אפשר להעלות PDF, טקסט, CSV או JSON.");
    event.target.value = "";
    return;
  }

  try {
    toast(isPdfFile(file) ? "קורא PDF..." : "קורא קבלה...");
    const text = await readReceiptText(file);
    learnFromReceiptText(text, "לא מצאתי מוצרים בקובץ.");
  } catch {
    toast(isPdfFile(file) ? "לא הצלחתי לקרוא את ה-PDF. נסה PDF עם טקסט." : "לא הצלחתי לקרוא את הקובץ.");
  } finally {
    event.target.value = "";
  }
}

async function scanReceiptImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    toast("צריך לצלם או לבחור תמונה של קבלה.");
    event.target.value = "";
    return;
  }

  try {
    elements.saveStatus.textContent = "סורק קבלה...";
    toast("סורק קבלה מהמצלמה...");
    const text = await readImageText(file);
    learnFromReceiptText(text, "לא הצלחתי לזהות מוצרים בתמונה.");
  } catch {
    toast("לא הצלחתי לסרוק את התמונה. נסה לצלם קרוב וברור יותר.");
    elements.saveStatus.textContent = "נשמר במכשיר";
  } finally {
    event.target.value = "";
  }
}

function learnFromReceiptText(text, emptyMessage) {
  const names = extractReceiptItems(text);
  if (!names.length) {
    toast(emptyMessage);
    return false;
  }

  const result = rememberPurchasedItems(names);
  elements.learnSummary.textContent = `נלמדו ${result.learned} מוצרים, ${result.added} חדשים.`;
  saveState(`למדתי ${result.learned} מוצרים`);
  render();
  return true;
}

function isSupportedReceiptFile(file) {
  const name = file.name.toLowerCase();
  return isPdfFile(file) || file.type.startsWith("text/") || [".txt", ".csv", ".json"].some((suffix) => name.endsWith(suffix));
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function readReceiptText(file) {
  if (isPdfFile(file)) return readPdfText(file);
  return file.text();
}

async function readImageText(file) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(file, "heb+eng", {
    logger: (message) => {
      if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
        elements.saveStatus.textContent = `סורק ${Math.round(message.progress * 100)}%`;
      }
    }
  });
  return result.data.text || "";
}

function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = loadScript(TESSERACT_SCRIPT_URL).then(() => window.Tesseract);
  }
  return tesseractPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      if (window.Tesseract) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function readPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }

  return pages.join("\n");
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_MODULE_URL).then((module) => {
      module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return module;
    });
  }
  return pdfJsPromise;
}

function rememberPurchasedItems(products) {
  let learned = 0;
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);

  products.forEach((product) => {
    const name = typeof product === "string" ? product : product.name;
    const note = typeof product === "string" ? "" : product.note;
    const match = findSimilarItem(name);
    if (match) {
      match.purchaseCount += 1;
      match.lastBoughtAt = today;
      match.needed = false;
      if (note && !match.note) match.note = note;
      learned += 1;
      return;
    }

    const entry = item(name, guessCategory(name), false, note);
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
    .map(parseReceiptLine)
    .filter((product) => product.name.length >= 3 && /[\u0590-\u05ff]/.test(product.name))
    .filter((product) => !blocked.some((word) => simplify(product.name).includes(simplify(word))))
    .filter((product) => {
      const key = simplify(product.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

function parseReceiptLine(line) {
  return {
    name: cleanReceiptLine(line),
    note: extractPackageSize(line)
  };
}

function extractPackageSize(line) {
  const matches = String(line).match(/\d+(?:[.,]\d+)?\s*(יחידות|יח|גרם|קג|ק״ג|קילו|מל|מ״ל|ליטר|%)/gi);
  if (!matches?.length) return "";
  return matches
    .map((match) => match.replace(/\s+/g, " ").trim())
    .slice(0, 2)
    .join(" · ");
}

function cleanReceiptLine(line) {
  return String(line)
    .replace(/[₪$]/g, " ")
    .replace(/\b\d+[.,]\d{1,2}\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(יחידות|יח|גרם|קג|ק״ג|קילו|מל|מ״ל|ליטר|%)/g, " ")
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

    navigator.serviceWorker.register("./service-worker.js?v=product-details-2").catch(() => undefined);
  });
}
