(() => {
  "use strict";

  const STORAGE_KEY = "uncapped.collection.v1";
  const APP_VERSION = "0.2.0";
  const rarityOrder = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

  const state = {
    collection: loadCollection(),
    scanner: null,
    scannerRunning: false,
    scanLocked: false,
    activeCardBarcode: null,
    manualMode: "create",
    deferredInstallPrompt: null
  };

  const el = {
    views: {
      scan: document.getElementById("scanView"),
      collection: document.getElementById("collectionView"),
      profile: document.getElementById("profileView")
    },
    reader: document.getElementById("reader"),
    startScannerBtn: document.getElementById("startScannerBtn"),
    stopScannerBtn: document.getElementById("stopScannerBtn"),
    manualForm: document.getElementById("manualForm"),
    upcInput: document.getElementById("upcInput"),
    statusBox: document.getElementById("statusBox"),
    uniqueCount: document.getElementById("uniqueCount"),
    totalScanCount: document.getElementById("totalScanCount"),
    rareCount: document.getElementById("rareCount"),
    searchInput: document.getElementById("searchInput"),
    rarityFilter: document.getElementById("rarityFilter"),
    collectionGrid: document.getElementById("collectionGrid"),
    emptyCollection: document.getElementById("emptyCollection"),
    profileSummary: document.getElementById("profileSummary"),
    shareCollectionBtn: document.getElementById("shareCollectionBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    clearBtn: document.getElementById("clearBtn"),
    installBtn: document.getElementById("installBtn"),
    cardDialog: document.getElementById("cardDialog"),
    dialogCardMount: document.getElementById("dialogCardMount"),
    closeDialogBtn: document.getElementById("closeDialogBtn"),
    shareCardBtn: document.getElementById("shareCardBtn"),
    editCardBtn: document.getElementById("editCardBtn"),
    manualProductDialog: document.getElementById("manualProductDialog"),
    manualProductForm: document.getElementById("manualProductForm"),
    manualBarcode: document.getElementById("manualBarcode"),
    manualBrand: document.getElementById("manualBrand"),
    manualName: document.getElementById("manualName"),
    manualCategory: document.getElementById("manualCategory"),
    cancelManualBtn: document.getElementById("cancelManualBtn"),
    toast: document.getElementById("toast")
  };

  init();

  function init() {
    bindNavigation();
    bindScanner();
    bindCollection();
    bindDialogs();
    bindBackup();
    bindInstall();
    renderAll();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  function bindNavigation() {
    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.nav));
    });
  }

  function navigate(viewName) {
    Object.entries(el.views).forEach(([name, view]) => {
      view.classList.toggle("active", name === viewName);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.nav === viewName);
    });
    if (viewName !== "scan") stopScanner();
    if (viewName === "collection") renderCollection();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindScanner() {
    el.startScannerBtn.addEventListener("click", startScanner);
    el.stopScannerBtn.addEventListener("click", stopScanner);

    el.manualForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const barcode = extractProductBarcode(el.upcInput.value);
      if (!isValidBarcode(barcode)) {
        setStatus("Enter a valid UPC, EAN, or GTIN barcode.", true);
        return;
      }
      processBarcode(barcode);
    });
  }

  async function startScanner() {
    if (state.scannerRunning) return;

    if (!window.Html5Qrcode) {
      setStatus("The camera scanner library did not load. Manual UPC entry still works.", true);
      return;
    }

    state.scanLocked = false;
    el.reader.innerHTML = "";
    state.scanner = new Html5Qrcode("reader", { verbose: false });

    try {
      await state.scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width, height) => {
            const boxWidth = Math.min(Math.floor(width * 0.84), 340);
            return { width: boxWidth, height: Math.max(120, Math.floor(boxWidth * 0.48)) };
          },
          aspectRatio: 1.777778,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.RSS_14,
            Html5QrcodeSupportedFormats.RSS_EXPANDED,
            Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION
          ]
        },
        (decodedText) => {
          if (state.scanLocked) return;
          const barcode = extractProductBarcode(decodedText);
          if (!isValidBarcode(barcode)) return;
          state.scanLocked = true;
          stopScanner().finally(() => processBarcode(barcode));
        },
        () => {}
      );

      state.scannerRunning = true;
      el.startScannerBtn.classList.add("hidden");
      el.stopScannerBtn.classList.remove("hidden");
      setStatus("Camera ready — line up the product barcode inside the frame.");
    } catch (error) {
      state.scannerRunning = false;
      restoreScannerPlaceholder();
      setStatus("Camera access wasn't available. You can enter the UPC manually below.", true);
    }
  }

  async function stopScanner() {
    if (!state.scanner) {
      state.scannerRunning = false;
      return;
    }

    try {
      if (state.scannerRunning) await state.scanner.stop();
      await state.scanner.clear();
    } catch (_) {
      // Scanner may already be stopped.
    }

    state.scanner = null;
    state.scannerRunning = false;
    el.startScannerBtn.classList.remove("hidden");
    el.stopScannerBtn.classList.add("hidden");
    restoreScannerPlaceholder();
  }

  function restoreScannerPlaceholder() {
    el.reader.innerHTML =
      '<div class="scanner-placeholder">' +
      '<div class="scan-frame" aria-hidden="true"></div>' +
      '<strong>Camera scanner</strong>' +
      '<span>Works best with the barcode flat and well lit.</span>' +
      "</div>";
  }

  async function processBarcode(rawBarcode) {
    const barcode = extractProductBarcode(rawBarcode);
    if (!isValidBarcode(barcode)) {
      setStatus("That doesn't look like a UPC, EAN, or GTIN product barcode.", true);
      state.scanLocked = false;
      return;
    }

    el.upcInput.value = barcode;
    setStatus("Looking up " + barcode + "…");

    try {
      const product = await lookupProduct(barcode);
      if (!product) {
        setStatus("Barcode found, but the product isn't in the public database yet.");
        openManualProduct(barcode);
        state.scanLocked = false;
        return;
      }

      const card = saveDiscovery(barcode, product);
      setStatus(card.scans > 1 ? "Already in your vault — scan count updated." : "New card discovered!");
      renderAll();
      showCard(card);
      toast(card.scans > 1 ? "Card updated" : card.rarity + " card added");
    } catch (error) {
      setStatus("Product lookup failed. You can still add the drink manually.", true);
      openManualProduct(barcode);
    } finally {
      state.scanLocked = false;
    }
  }

  const VERIFIED_PRODUCT_CATALOG = {
    "01201303": { name: "Pepsi", brand: "Pepsi", category: "Soda", quantity: "12 fl oz", source: "Verified catalog" },
    "012000100109": { name: "Pepsi", brand: "Pepsi", category: "Soda", quantity: "12 fl oz cans", source: "Verified catalog" },
    "012000018770": { name: "Pepsi Zero Sugar", brand: "Pepsi", category: "Soda", quantity: "12 fl oz", source: "Verified catalog" },
    "049000006346": { name: "Coca-Cola Classic", brand: "Coca-Cola", category: "Soda", quantity: "12 fl oz", source: "Verified catalog" },
    "070847811169": { name: "Monster Energy Original", brand: "Monster Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "070847020530": { name: "Monster Energy Ultra Black", brand: "Monster Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "070847012474": { name: "Monster Energy Zero Ultra", brand: "Monster Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "084259510936": { name: "C4 Performance Energy Orange Slice", brand: "C4 Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "0084259510936": { name: "C4 Performance Energy Orange Slice", brand: "C4 Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "842595139778": { name: "C4 Energy Pink Lemonade", brand: "C4 Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "611269991000": { name: "Red Bull Energy Drink", brand: "Red Bull", category: "Energy", quantity: "8.4 fl oz", source: "Verified catalog" },
    "081809400001": { name: "Rockstar Energy Drink", brand: "Rockstar", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "012000000850": { name: "Mountain Dew", brand: "Mountain Dew", category: "Soda", quantity: "12 fl oz", source: "Verified catalog" },
    "012000163807": { name: "Mountain Dew", brand: "Mountain Dew", category: "Soda", quantity: "12 fl oz", source: "Verified catalog" },
    "889392000313": { name: "CELSIUS Sparkling Orange", brand: "CELSIUS", category: "Energy", quantity: "12 fl oz", source: "Verified catalog" },
    "889392001723": { name: "CELSIUS Retro Vibe", brand: "CELSIUS", category: "Energy", quantity: "12 fl oz", source: "Verified catalog" },
    "810085812180": { name: "GHOST Energy Orange Cream", brand: "GHOST Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "081008581689": { name: "GHOST Energy Electric Limeade", brand: "GHOST Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "0081008581689": { name: "GHOST Energy Electric Limeade", brand: "GHOST Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "810169604199": { name: "GHOST Energy A&W Root Beer", brand: "GHOST Energy", category: "Energy", quantity: "16 fl oz", source: "Verified catalog" },
    "078000804690": { name: "Dr Pepper", brand: "Dr Pepper", category: "Soda", quantity: "12 fl oz cans", source: "Verified catalog" },
    "052000328677": { name: "Gatorade Orange Thirst Quencher", brand: "Gatorade", category: "Sports", quantity: "20 fl oz", source: "Verified catalog" },
    "052000328660": { name: "Gatorade Fruit Punch Thirst Quencher", brand: "Gatorade", category: "Sports", quantity: "20 fl oz", source: "Verified catalog" }
  };

  const BRAND_PREFIXES = [
    { prefix: "012000", brand: "PepsiCo", name: "PepsiCo Beverage", category: "Beverage" },
    { prefix: "049000", brand: "The Coca-Cola Company", name: "Coca-Cola Company Beverage", category: "Beverage" },
    { prefix: "070847", brand: "Monster Energy", name: "Monster Energy Beverage", category: "Energy" },
    { prefix: "0842595", brand: "C4 Energy", name: "C4 Energy Beverage", category: "Energy" },
    { prefix: "842595", brand: "C4 Energy", name: "C4 Energy Beverage", category: "Energy" },
    { prefix: "611269", brand: "Red Bull", name: "Red Bull Energy Drink", category: "Energy" },
    { prefix: "0818094", brand: "Rockstar", name: "Rockstar Energy Drink", category: "Energy" },
    { prefix: "818094", brand: "Rockstar", name: "Rockstar Energy Drink", category: "Energy" },
    { prefix: "889392", brand: "CELSIUS", name: "CELSIUS Energy Drink", category: "Energy" },
    { prefix: "052000", brand: "Gatorade", name: "Gatorade Beverage", category: "Sports" },
    { prefix: "078000", brand: "Keurig Dr Pepper", name: "Keurig Dr Pepper Beverage", category: "Beverage" }
  ];

  async function lookupProduct(barcode) {
    const variants = barcodeVariants(barcode);

    for (const code of variants) {
      if (VERIFIED_PRODUCT_CATALOG[code]) {
        return { ...VERIFIED_PRODUCT_CATALOG[code], image: "" };
      }
    }

    const providers = [lookupUpcDev, lookupBarcodeFinder, lookupOpenFoodFacts];

    for (const provider of providers) {
      for (const code of variants.slice(0, 3)) {
        try {
          const product = await provider(code);
          if (product && (product.name || product.brand)) return product;
        } catch (_) {
          // A provider can be unavailable, rate-limited, or block browser CORS.
          // Continue to the next source instead of failing the scan.
        }
      }
    }

    const inferred = inferBrandFromPrefix(variants);
    return inferred;
  }

  async function lookupUpcDev(barcode) {
    const response = await fetchWithTimeout(
      "https://upc.dev/v1/product/" + encodeURIComponent(barcode),
      { headers: { Accept: "application/json" } },
      4500
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const p = payload && payload.data ? payload.data : payload;
    if (!p || p.ok === false || (!p.name && !p.brand)) return null;

    const name = cleanText(p.name || p.title || "");
    const brand = cleanText(p.brand || p.manufacturer || "");
    const category = cleanText(p.category || "");
    return {
      name: name || "Unknown beverage",
      brand: brand || "Unknown brand",
      category: classifyCategory(category + " " + name + " " + brand),
      image: p.image_url || p.image || "",
      quantity: cleanText(p.weight || p.size || ""),
      source: "upc.dev"
    };
  }

  async function lookupBarcodeFinder(barcode) {
    const response = await fetchWithTimeout(
      "https://api.barcodefinder.info/barcode/" + encodeURIComponent(barcode),
      { headers: { Accept: "application/json" } },
      4500
    );
    if (!response.ok) return null;
    const p = await response.json();
    if (!p || (!p.title && !p.name && !p.brand)) return null;

    const name = cleanText(p.title || p.name || "");
    const brand = cleanText(p.brand || p.manufacturer || "");
    const category = cleanText(p.category || "");
    const images = Array.isArray(p.images) ? p.images : [];
    return {
      name: name || "Unknown beverage",
      brand: brand || "Unknown brand",
      category: classifyCategory(category + " " + name + " " + brand),
      image: images[0] || p.image || p.image_url || "",
      quantity: cleanText(p.size || p.quantity || ""),
      source: "BarcodeFinder"
    };
  }

  async function lookupOpenFoodFacts(barcode) {
    const fields = [
      "code",
      "product_name",
      "product_name_en",
      "brands",
      "categories",
      "categories_tags",
      "image_front_url",
      "image_front_small_url",
      "quantity"
    ].join(",");

    const url =
      "https://world.openfoodfacts.org/api/v2/product/" +
      encodeURIComponent(barcode) +
      ".json?fields=" +
      encodeURIComponent(fields);

    const response = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" }
    }, 4500);

    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const name = cleanText(p.product_name_en || p.product_name || "");
    const brand = cleanText((p.brands || "").split(",")[0] || "");
    if (!name && !brand) return null;

    const categorySource = [p.categories || "", ...(p.categories_tags || [])].join(" ");
    return {
      name: name || "Unknown beverage",
      brand: brand || "Unknown brand",
      category: classifyCategory(categorySource + " " + name + " " + brand),
      image: p.image_front_small_url || p.image_front_url || "",
      quantity: cleanText(p.quantity || ""),
      source: "Open Food Facts"
    };
  }

  function inferBrandFromPrefix(variants) {
    for (const code of variants) {
      const match = BRAND_PREFIXES.find((entry) => code.startsWith(entry.prefix));
      if (match) {
        return {
          name: match.name,
          brand: match.brand,
          category: match.category,
          image: "",
          quantity: "",
          source: "Manufacturer prefix"
        };
      }
    }
    return null;
  }

  function barcodeVariants(barcode) {
    const values = new Set([barcode]);
    if (barcode.length === 12) values.add("0" + barcode);
    if (barcode.length === 13 && barcode.startsWith("0")) values.add(barcode.slice(1));
    if (barcode.length === 14 && barcode.startsWith("0")) values.add(barcode.slice(1));
    if (barcode.length === 14 && barcode.startsWith("00")) values.add(barcode.slice(2));
    return Array.from(values).filter(isValidBarcode);
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(options || {}), signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  function classifyCategory(source) {
    const text = String(source || "").toLowerCase();
    if (/energy|monster|red bull|rockstar|bang\b/.test(text)) return "Energy";
    if (/beer|lager|ale\b|stout|pilsner|ipa\b/.test(text)) return "Beer";
    if (/sports drink|isotonic|electrolyte|gatorade|powerade/.test(text)) return "Sports";
    if (/soda|soft drink|cola\b|root beer|lemon-lime|carbonated/.test(text)) return "Soda";
    if (/coffee|espresso|latte|cappuccino|cold brew/.test(text)) return "Coffee";
    if (/\btea\b|kombucha/.test(text)) return "Tea";
    if (/juice|nectar|smoothie/.test(text)) return "Juice";
    if (/water|mineral water|spring water|sparkling water|seltzer/.test(text)) return "Water";
    return "Beverage";
  }

  function saveDiscovery(barcode, product) {
    const existing = state.collection[barcode];
    const now = new Date().toISOString();

    if (existing) {
      existing.scans = Number(existing.scans || 1) + 1;
      existing.lastSeen = now;
      if ((!existing.image || existing.brand === "Unknown brand") && product.image) {
        existing.image = product.image;
      }
      if (existing.name === "Unknown beverage" && product.name) existing.name = product.name;
      if (existing.brand === "Unknown brand" && product.brand) existing.brand = product.brand;
      persistCollection();
      return existing;
    }

    const card = {
      barcode,
      name: cleanText(product.name) || "Unknown beverage",
      brand: cleanText(product.brand) || "Unknown brand",
      category: product.category || "Beverage",
      image: product.image || "",
      quantity: product.quantity || "",
      source: product.source || "Manual",
      rarity: rarityForBarcode(barcode),
      serial: serialForBarcode(barcode),
      firstSeen: now,
      lastSeen: now,
      scans: 1
    };

    state.collection[barcode] = card;
    persistCollection();
    return card;
  }

  function rarityForBarcode(barcode) {
    const value = stableHash(barcode) % 1000;
    if (value >= 985) return "Legendary";
    if (value >= 930) return "Epic";
    if (value >= 800) return "Rare";
    if (value >= 550) return "Uncommon";
    return "Common";
  }

  function serialForBarcode(barcode) {
    return String((stableHash("UNCAPPED-" + barcode) % 9999) + 1).padStart(4, "0");
  }

  function stableHash(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function renderAll() {
    renderStats();
    renderCollection();
  }

  function renderStats() {
    const cards = Object.values(state.collection);
    const scans = cards.reduce((sum, card) => sum + Number(card.scans || 1), 0);
    const rarePlus = cards.filter((card) => rarityOrder.indexOf(card.rarity) >= rarityOrder.indexOf("Rare")).length;

    el.uniqueCount.textContent = String(cards.length);
    el.totalScanCount.textContent = String(scans);
    el.rareCount.textContent = String(rarePlus);
    el.profileSummary.textContent =
      cards.length + (cards.length === 1 ? " discovery" : " discoveries") +
      " • " + scans + (scans === 1 ? " scan" : " scans");
  }

  function bindCollection() {
    el.searchInput.addEventListener("input", renderCollection);
    el.rarityFilter.addEventListener("change", renderCollection);

    el.collectionGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-card-barcode]");
      if (!button) return;
      const card = state.collection[button.dataset.cardBarcode];
      if (card) showCard(card);
    });

    el.shareCollectionBtn.addEventListener("click", shareCollection);
  }

  function renderCollection() {
    const query = (el.searchInput.value || "").trim().toLowerCase();
    const rarity = el.rarityFilter.value;

    const cards = Object.values(state.collection)
      .filter((card) => {
        const haystack = [card.brand, card.name, card.category, card.barcode].join(" ").toLowerCase();
        return (!query || haystack.includes(query)) && (rarity === "all" || card.rarity === rarity);
      })
      .sort((a, b) => {
        const rarityDiff = rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity);
        if (rarityDiff !== 0) return rarityDiff;
        return new Date(b.firstSeen) - new Date(a.firstSeen);
      });

    el.emptyCollection.classList.toggle("hidden", Object.keys(state.collection).length > 0);
    el.collectionGrid.innerHTML = cards.map(cardMarkup).join("");

    if (Object.keys(state.collection).length > 0 && cards.length === 0) {
      el.collectionGrid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1"><h2>No matching cards.</h2><p>Try another search or rarity filter.</p></div>';
    }
  }

  function cardMarkup(card) {
    const image = card.image
      ? '<img src="' + escapeAttr(card.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
      : '<span class="initials">' + escapeHtml(initials(card.brand || card.name)) + "</span>";

    return (
      '<article class="collectible" data-rarity="' + escapeAttr(card.rarity) + '">' +
        '<button type="button" data-card-barcode="' + escapeAttr(card.barcode) + '" aria-label="Open ' + escapeAttr(card.name) + ' card"></button>' +
        '<div class="card-topline">' +
          '<span class="card-rarity">' + escapeHtml(card.rarity) + "</span>" +
          '<span class="card-type">' + escapeHtml(card.category) + "</span>" +
        "</div>" +
        '<div class="card-art">' + image + "</div>" +
        '<div class="card-brand">' + escapeHtml(card.brand) + "</div>" +
        '<div class="card-name">' + escapeHtml(card.name) + "</div>" +
        '<div class="card-footer">' +
          '<span>#' + escapeHtml(card.serial) + "</span>" +
          '<span>×' + Number(card.scans || 1) + "</span>" +
        "</div>" +
      "</article>"
    );
  }

  function showCard(card) {
    state.activeCardBarcode = card.barcode;
    el.dialogCardMount.innerHTML = cardMarkup(card);
    const overlayButton = el.dialogCardMount.querySelector("button");
    if (overlayButton) overlayButton.remove();
    if (typeof el.cardDialog.showModal === "function") {
      el.cardDialog.showModal();
    }
  }

  function bindDialogs() {
    el.closeDialogBtn.addEventListener("click", () => el.cardDialog.close());
    el.cardDialog.addEventListener("click", (event) => {
      if (event.target === el.cardDialog) el.cardDialog.close();
    });
    el.shareCardBtn.addEventListener("click", () => {
      const card = state.collection[state.activeCardBarcode];
      if (card) shareCard(card);
    });
    el.editCardBtn.addEventListener("click", () => {
      const card = state.collection[state.activeCardBarcode];
      if (!card) return;
      el.cardDialog.close();
      openManualProduct(card.barcode, card);
    });

    el.cancelManualBtn.addEventListener("click", () => el.manualProductDialog.close());

    el.manualProductForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const barcode = el.manualBarcode.value;
      const product = {
        brand: el.manualBrand.value.trim(),
        name: el.manualName.value.trim(),
        category: el.manualCategory.value,
        image: state.collection[barcode] ? state.collection[barcode].image : "",
        quantity: state.collection[barcode] ? state.collection[barcode].quantity : "",
        source: state.manualMode === "edit" && state.collection[barcode] ? state.collection[barcode].source : "Manual"
      };

      let card;
      if (state.manualMode === "edit" && state.collection[barcode]) {
        card = state.collection[barcode];
        card.brand = cleanText(product.brand);
        card.name = cleanText(product.name);
        card.category = product.category;
        persistCollection();
      } else {
        card = saveDiscovery(barcode, product);
      }

      el.manualProductDialog.close();
      renderAll();
      showCard(card);
      toast(state.manualMode === "edit" ? "Card updated" : card.rarity + " card added");
    });
  }

  function openManualProduct(barcode, existing) {
    state.manualMode = existing ? "edit" : "create";
    el.manualBarcode.value = barcode;
    el.manualBrand.value = existing ? existing.brand : "";
    el.manualName.value = existing ? existing.name : "";
    el.manualCategory.value = existing ? existing.category : "Beverage";
    if (typeof el.manualProductDialog.showModal === "function") {
      el.manualProductDialog.showModal();
    }
  }

  async function shareCard(card) {
    const text =
      "My Uncapped pull: " + card.brand + " " + card.name +
      " — " + card.rarity + " • " + card.category +
      " • #" + card.serial;

    await shareText("Uncapped card", text);
  }

  async function shareCollection() {
    const cards = Object.values(state.collection);
    if (!cards.length) {
      toast("Scan a card first");
      return;
    }

    const counts = rarityOrder
      .slice()
      .reverse()
      .map((rarity) => {
        const count = cards.filter((card) => card.rarity === rarity).length;
        return count ? rarity + ": " + count : "";
      })
      .filter(Boolean)
      .join(" • ");

    const text = "My Uncapped vault: " + cards.length + " unique cards. " + counts;
    await shareText("My Uncapped vault", text);
  }

  async function shareText(title, text) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard");
      } else {
        toast(text);
      }
    } catch (_) {
      // User cancelled the share sheet.
    }
  }

  function bindBackup() {
    el.exportBtn.addEventListener("click", () => {
      const payload = {
        app: "Uncapped",
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        collection: state.collection
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = "uncapped-collection-" + date + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    el.importInput.addEventListener("change", async () => {
      const file = el.importInput.files && el.importInput.files[0];
      if (!file) return;

      try {
        const parsed = JSON.parse(await file.text());
        const incoming = parsed.collection || parsed;
        if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("Invalid backup");

        const cleaned = {};
        Object.values(incoming).forEach((card) => {
          if (!card || !isValidBarcode(normalizeBarcode(card.barcode))) return;
          const barcode = normalizeBarcode(card.barcode);
          cleaned[barcode] = {
            barcode,
            name: cleanText(card.name || "Unknown beverage"),
            brand: cleanText(card.brand || "Unknown brand"),
            category: cleanText(card.category || "Beverage"),
            image: typeof card.image === "string" ? card.image : "",
            quantity: cleanText(card.quantity || ""),
            source: cleanText(card.source || "Imported"),
            rarity: rarityForBarcode(barcode),
            serial: serialForBarcode(barcode),
            firstSeen: card.firstSeen || new Date().toISOString(),
            lastSeen: card.lastSeen || card.firstSeen || new Date().toISOString(),
            scans: Math.max(1, Number(card.scans || 1))
          };
        });

        if (!Object.keys(cleaned).length) throw new Error("No cards");

        if (confirm("Replace the collection on this device with " + Object.keys(cleaned).length + " imported cards?")) {
          state.collection = cleaned;
          persistCollection();
          renderAll();
          toast("Collection restored");
        }
      } catch (_) {
        toast("That backup file isn't valid");
      } finally {
        el.importInput.value = "";
      }
    });

    el.clearBtn.addEventListener("click", () => {
      if (!Object.keys(state.collection).length) {
        toast("Collection is already empty");
        return;
      }
      if (confirm("Clear every Uncapped card stored on this device?")) {
        state.collection = {};
        persistCollection();
        renderAll();
        toast("Local collection cleared");
      }
    });
  }

  function bindInstall() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      el.installBtn.classList.remove("hidden");
    });

    el.installBtn.addEventListener("click", async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      el.installBtn.classList.add("hidden");
    });
  }

  function loadCollection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function persistCollection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collection));
  }

  function extractProductBarcode(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const parenthesizedGtIn = raw.match(/\(01\)\s*(\d{14})/);
    if (parenthesizedGtIn) return parenthesizedGtIn[1];

    const digits = raw.replace(/\D/g, "");

    // GS1-128 / GS1 Data Matrix commonly starts with Application Identifier 01,
    // followed by a 14-digit GTIN and then lot/date data.
    if (digits.length >= 16 && digits.startsWith("01")) {
      return digits.slice(2, 16);
    }

    if (/^\d{8,14}$/.test(digits)) return digits;
    return "";
  }

  function normalizeBarcode(value) {
    return extractProductBarcode(value);
  }

  function isValidBarcode(value) {
    return /^\d{8,14}$/.test(value);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function initials(value) {
    const parts = String(value || "U").trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "U") + (parts[1]?.[0] || "");
  }

  function setStatus(message, isError) {
    el.statusBox.textContent = message;
    el.statusBox.classList.remove("hidden");
    el.statusBox.style.borderColor = isError ? "rgba(255,107,107,.35)" : "";
    el.statusBox.style.color = isError ? "#ffaaaa" : "";
    el.statusBox.style.background = isError ? "rgba(255,107,107,.08)" : "";
  }

  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("show");
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
