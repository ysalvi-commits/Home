const FIREBASE_VERSION = "10.12.5";
const FIREBASE_BASE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const ROOT_PATH = "households";
const ITEMS_PATH = "items";

export function createCloudSync({ config, getItems, replaceItems, onStatus }) {
  const sync = {
    db: null,
    database: null,
    unsubscribe: null,
    ready: false,
    applyingRemote: false,
    writing: false,
    saveTimer: 0,
    pendingChangedIds: new Set(),
    pendingDeletedIds: new Set()
  };

  function isConfigured() {
    return Boolean(
      config?.enabled &&
        config?.householdId &&
        config?.firebaseConfig?.apiKey &&
        config?.firebaseConfig?.projectId &&
        config?.firebaseConfig?.databaseURL &&
        config?.firebaseConfig?.appId
    );
  }

  function setStatus(label, mode, detail = "") {
    onStatus?.({ label, mode, detail });
  }

  function itemsRef() {
    return sync.database.ref(sync.db, `${ROOT_PATH}/${config.householdId}/${ITEMS_PATH}`);
  }

  async function start() {
    if (!isConfigured()) {
      setStatus("Local only", "local", "Add Firebase config to enable live sync.");
      return;
    }

    try {
      setStatus("Connecting", "syncing", "Connecting to Firebase.");
      const [appModule, authModule, databaseModule] = await Promise.all([
        import(`${FIREBASE_BASE_URL}/firebase-app.js`),
        import(`${FIREBASE_BASE_URL}/firebase-auth.js`),
        import(`${FIREBASE_BASE_URL}/firebase-database.js`)
      ]);

      const app = appModule.initializeApp(config.firebaseConfig, `groceries-${config.householdId}`);
      const auth = authModule.getAuth(app);
      await authModule.signInAnonymously(auth);

      sync.db = databaseModule.getDatabase(app);
      sync.database = databaseModule;
      sync.ready = true;

      const firstSnapshot = await databaseModule.get(itemsRef());
      if (!firstSnapshot.exists() && getItems().length) {
        await seedCloud(getItems());
      } else {
        applyRemoteItems(firstSnapshot.val(), "Shared live");
      }

      sync.unsubscribe = databaseModule.onValue(
        itemsRef(),
        (snapshot) => {
          applyRemoteItems(snapshot.val(), "Shared live");
        },
        (error) => {
          setStatus("Sync paused", "error", error.message);
        }
      );

      if (sync.pendingChangedIds.size || sync.pendingDeletedIds.size) flushSaves();
    } catch (error) {
      setStatus("Firebase setup needed", "error", error.message);
    }
  }

  function applyRemoteItems(value, label) {
    if (sync.writing || sync.pendingChangedIds.size || sync.pendingDeletedIds.size || sync.saveTimer) return;
    const items = Object.entries(value || {})
      .map(([id, data]) => cloudDocToItem(id, data))
      .filter((entry) => entry.name);
    sync.applyingRemote = true;
    replaceItems(items);
    sync.applyingRemote = false;
    setStatus(label, label === "Syncing" ? "syncing" : "live", "Updates appear on both phones.");
  }

  async function seedCloud(items) {
    const payload = {};
    items.forEach((entry) => {
      payload[firebaseKey(entry.id)] = itemToCloudDoc(entry);
    });
    await sync.database.set(itemsRef(), payload);
    setStatus("Shared live", "live", "Initial list copied to Firebase.");
  }

  function save({ changedIds = [], deletedIds = [] } = {}) {
    if (sync.applyingRemote) return;

    changedIds.forEach((id) => {
      if (id) sync.pendingChangedIds.add(id);
    });
    deletedIds.forEach((id) => {
      if (!id) return;
      sync.pendingDeletedIds.add(id);
      sync.pendingChangedIds.delete(id);
    });

    if (!sync.ready || (!sync.pendingChangedIds.size && !sync.pendingDeletedIds.size)) return;
    window.clearTimeout(sync.saveTimer);
    sync.saveTimer = window.setTimeout(flushSaves, 0);
    setStatus("Syncing", "syncing", "Sending changes to Firebase.");
  }

  async function flushSaves() {
    if (!sync.ready) return;
    window.clearTimeout(sync.saveTimer);
    sync.saveTimer = 0;

    const changedIds = [...sync.pendingChangedIds];
    const deletedIds = [...sync.pendingDeletedIds];
    sync.pendingChangedIds.clear();
    sync.pendingDeletedIds.clear();

    const itemsById = new Map(getItems().map((entry) => [entry.id, entry]));
    const updates = {};

    changedIds.forEach((id) => {
      const entry = itemsById.get(id);
      if (entry) updates[firebaseKey(id)] = itemToCloudDoc(entry);
    });

    deletedIds.forEach((id) => {
      updates[firebaseKey(id)] = null;
    });

    try {
      sync.writing = true;
      if (Object.keys(updates).length) await sync.database.update(itemsRef(), updates);
      setStatus("Shared live", "live", "Updated just now.");
    } catch (error) {
      changedIds.forEach((id) => sync.pendingChangedIds.add(id));
      deletedIds.forEach((id) => sync.pendingDeletedIds.add(id));
      setStatus("Sync paused", "error", error.message);
    } finally {
      sync.writing = false;
    }
  }

  function itemToCloudDoc(entry) {
    return {
      name: entry.name,
      category: entry.category || "כללי",
      needed: Boolean(entry.needed),
      note: entry.note || "",
      purchaseCount: Number(entry.purchaseCount || 0),
      lastBoughtAt: entry.lastBoughtAt || "",
      updatedAt: sync.database.serverTimestamp()
    };
  }

  function cloudDocToItem(id, data = {}) {
    return {
      id,
      name: String(data.name || "").trim(),
      category: String(data.category || "כללי").trim(),
      needed: Boolean(data.needed),
      note: String(data.note || "").trim(),
      purchaseCount: Math.max(0, Number(data.purchaseCount || 0)),
      lastBoughtAt: String(data.lastBoughtAt || "").trim()
    };
  }

  function firebaseKey(id) {
    return String(id || "")
      .replace(/[.#$/[\]]/g, "-")
      .slice(0, 120);
  }

  return {
    start,
    save,
    get applyingRemote() {
      return sync.applyingRemote;
    }
  };
}
