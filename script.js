// --- Firebase Configuration (TO BE UPDATED BY USER) ---
const firebaseConfig = {
    apiKey: "AIzaSyA0CzLLQlNarK48BqixUKXt66ZbBROgMaU",
    authDomain: "calibri-bd91e.firebaseapp.com",
    databaseURL: "https://calibri-bd91e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "calibri-bd91e",
    storageBucket: "calibri-bd91e.firebasestorage.app",
    messagingSenderId: "516334342686",
    appId: "1:516334342686:web:ccaee7f356fb52a8f7140f",
    measurementId: "G-TDHTETSLKZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const dbRef = db.ref('erp_data');

// --- Advanced State Management ---
const DEFAULT_STATE = {
    materials: [
        { id: 'm1', name: 'Paxta', stock: 100, unit: 'm', costPerUnit: 15000 },
        { id: 'm2', name: 'Ipak', stock: 50, unit: 'm', costPerUnit: 45000 }
    ],
    products: [],
    history: {},
    pendingWork: [],
    notepad: "",
    aiMessages: [],
    totalBalance: 0,
    currentInventoryTab: 'ready',
    currentHistoryTab: 'prod_hist',
    filterDate: ""
};

const UI_VIEWS = ['productionView', 'salesView', 'salariesView', 'skladView', 'ojidaniyaView', 'tarixView'];

// Start with LocalStorage or Default
let localData = localStorage.getItem('calibri_erp_state');
let state = localData ? JSON.parse(localData) : JSON.parse(JSON.stringify(DEFAULT_STATE));
if (!state.filterDate) state.filterDate = getTodayStr();

function getTodayStr() {
    const d = new Date();
    // Using dashes (-) for Firebase compatibility (No dots allowed in keys)
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function formatDateForUI(dStr) {
    if (!dStr) return "";
    // User wants slashes (/) for display, but we use dashes (-) for the database
    return dStr.replaceAll('-', '/');
}

// --- Persistence & Sync Logic ---
let isSynced = false;

// Robust Deep Merge: Prevents cloud from wiping local if local is more complete
function deepMergeState(local, cloud) {
    if (!cloud) return local;

    const merged = { ...local, ...cloud };

    // 1. Merge History (Dates)
    if (local.history && cloud.history) {
        merged.history = { ...cloud.history };
        Object.keys(local.history).forEach(dateKey => {
            const localDay = local.history[dateKey];
            const cloudDay = cloud.history[dateKey];

            if (cloudDay) {
                const localCount = (localDay.production?.length || 0) + (localDay.sales?.length || 0);
                const cloudCount = (cloudDay.production?.length || 0) + (cloudDay.sales?.length || 0);

                if (localCount > cloudCount) {
                    merged.history[dateKey] = localDay;
                    if (cloudDay.paidWorkers) {
                        const mergedPaid = Array.from(new Set([...(localDay.paidWorkers || []), ...cloudDay.paidWorkers]));
                        merged.history[dateKey].paidWorkers = mergedPaid;
                    }
                }
            } else {
                merged.history[dateKey] = localDay;
            }
        });
    }

    // 2. Symmetric Array Merging (The Law v4 - Absolute Protection)
    // This prevents new local Sklad items from being ghosted by cloud sync
    const mergeArrays = (localArr, cloudArr) => {
        const result = cloudArr ? [...cloudArr] : [];
        if (!localArr) return result;
        const cloudIds = new Set(result.map(x => x.id));
        localArr.forEach(item => {
            if (!cloudIds.has(item.id)) {
                result.push(item);
            }
        });
        return result;
    };

    merged.products = mergeArrays(local.products, cloud.products);
    merged.materials = mergeArrays(local.materials, cloud.materials);

    // 3. Merge Ojidaniya (Pending Work)
    if (local.pendingWork && cloud.pendingWork) {
        const cloudIds = new Set(cloud.pendingWork.map(p => p.id));
        const onlyInLocal = local.pendingWork.filter(p => !cloudIds.has(p.id));
        merged.pendingWork = [...cloud.pendingWork, ...onlyInLocal];
    } else if (local.pendingWork && !cloud.pendingWork) {
        merged.pendingWork = local.pendingWork;
    }

    // 4. Notepad Drawing Safeguard
    if (local.notepadDrawing && (!cloud.notepadDrawing || local.notepadDrawing.length > cloud.notepadDrawing.length)) {
        merged.notepadDrawing = local.notepadDrawing;
    }

    // 5. Balance Safeguard
    merged.totalBalance = Math.max(local.totalBalance || 0, cloud.totalBalance || 0);

    return merged;
}

// 1. Load from Cloud (Firebase)
dbRef.once('value').then((snapshot) => {
    const cloudRaw = snapshot.val();
    const currentFilterDate = state.filterDate || getTodayStr();

    if (cloudRaw) {
        // Migration logic
        if (cloudRaw.history) {
            const newHistory = {};
            Object.keys(cloudRaw.history).forEach(key => {
                const newKey = key.replaceAll('.', '-');
                newHistory[newKey] = cloudRaw.history[key];
            });
            cloudRaw.history = newHistory;
        }

        state = deepMergeState(state, cloudRaw);
    } else {
        console.log("Cloud is empty. Using local as source of truth.");
    }

    state.filterDate = currentFilterDate.replaceAll('.', '-');
    if (!state.history) state.history = {};
    if (!state.pendingWork) state.pendingWork = [];
    if (!state.products) state.products = [];
    if (!state.materials) state.materials = [];
    if (!state.notepad) state.notepad = "";
    if (!state.notepadDrawing) state.notepadDrawing = "";

    isSynced = true;
    localStorage.setItem('calibri_erp_state', JSON.stringify(state));
    updateUI();
    save();

    // Now switch to real-time listener for future updates
    dbRef.on('value', (snap) => {
        const data = snap.val();
        if (data && isSynced) {
            // Only update if it's a genuine new update from another client
            // (Simple version: always update UI if isSynced is true)
            // In a pro ERP we might check timestamps, but for now deepMerge works.
            state = deepMergeState(state, data);
            updateUI();
        }
    });

    // real-time refresh pulse for absolute sync (0.5s)
    setInterval(() => {
        if (isSynced) updateUI();
    }, 500);
}).catch(err => {
    console.error("Critical Sync Error:", err);
    isSynced = true; // Still allow local work
    updateUI();
});

// 2. Global Save Function
function save() {
    // Stage 1: Save to LocalStorage (Instant & Offline)
    localStorage.setItem('calibri_erp_state', JSON.stringify(state));

    // Stage 2: Save to Cloud (Firebase)
    if (!isSynced) return;

    const cleanedState = JSON.parse(JSON.stringify(state));
    dbRef.set(cleanedState).then(() => {
        console.log("Data Saved to Cloud ☁️");
        // Instant sync feedback
        setTimeout(updateUI, 100);
    }).catch(err => {
        console.error("Cloud Save Error:", err);
    });
}

function addNewDate() {
    const todayUI = formatDateForUI(getTodayStr());
    const newDateUI = prompt("Yangi sana kiriting (Format: DD/MM/YYYY)\nMasalan: 03/03/2026", todayUI);
    if (!newDateUI) return;

    // Convert UI (/) to DB (-)
    const newDateDB = newDateUI.replaceAll('/', '-');

    // Format check (XX-XX-XXXX)
    const regex = /^\d{2}-\d{2}-\d{4}$/;
    if (!regex.test(newDateDB)) return alert("Sana formati noto'g'ri! (DD/MM/YYYY)");

    if (!state.history[newDateDB]) {
        state.history[newDateDB] = { production: [], sales: [] };
    }

    state.filterDate = newDateDB;
    updateUI();
    save();
}

function openPendingModal() {
    document.getElementById('pendingAddForm').style.display = 'flex';
}

function submitPendingWork() {
    const workerName = document.getElementById('pWorkerName').value.trim();
    const itemName = document.getElementById('pItemName').value.trim();
    const qty = parseInt(document.getElementById('pQty').value);

    if (!workerName || !itemName || isNaN(qty)) return alert("Ma'lumotlarni to'ldiring!");

    if (!state.pendingWork) state.pendingWork = [];

    state.pendingWork.push({
        id: Date.now(),
        workerName,
        itemName,
        qty,
        createdAt: new Date().toISOString()
    });

    console.log("Worker added to Ojidaniya:", workerName);
    alert("Ojidaniya: Ishchi muvaffaqiyatli qo'shildi! ✅");

    document.getElementById('pendingAddForm').style.display = 'none';
    // Clear inputs
    document.getElementById('pWorkerName').value = '';
    document.getElementById('pItemName').value = '';
    document.getElementById('pQty').value = '';

    updateUI(); // Instant update
    save();
}

function deletePendingWork(id) {
    secureDelete(() => {
        // No security needed for completion, but let's keep it safe
        state.pendingWork = state.pendingWork.filter(p => p.id !== id);
        updateUI();
        save();
    });
}

function calculateDaysPassed(createdAt) {
    if (!createdAt) return 0;
    const start = new Date(createdAt);
    if (isNaN(start.getTime())) return 0;
    const today = new Date();
    const diffTime = Math.abs(today - start);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// --- Navigation ---
function showView(viewId, btn) {
    if (!btn) return;
    console.log("Navigating to:", viewId);

    // Update Nav Buttons
    document.querySelectorAll('.nav-buttons .btn-thin').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Toggle Views with High Priority
    UI_VIEWS.forEach(v => {
        const el = document.getElementById(v);
        if (el) {
            if (v === viewId + 'View') {
                el.style.setProperty('display', 'block', 'important');
            } else {
                el.style.setProperty('display', 'none', 'important');
            }
        }
    });

    // Final safety: ensure productionView is hidden if not explicitly requested
    if (viewId !== 'production') {
        const prod = document.getElementById('productionView');
        if (prod) prod.style.setProperty('display', 'none', 'important');
    }

    updateUI();
}

function setInventoryTab(tab, btn) {
    state.currentInventoryTab = tab;
    document.querySelectorAll('#skladView .btn-thin').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateUI();
}

function setHistoryTab(tab, btn) {
    state.currentHistoryTab = tab;
    document.querySelectorAll('#tarixView .btn-thin').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show/Hide Worker Filter
    const filterContainer = document.getElementById('workerFilterContainer');
    if (filterContainer) {
        filterContainer.style.display = (tab === 'worker_hist') ? 'block' : 'none';
    }

    renderDetailedHistory();
}

// --- Dynamic Form Rows ---
let materialRowCounter = 0;
function addMaterialRow() {
    const container = document.getElementById('materialRowsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-row';
    div.id = `mat-row-${materialRowCounter}`;
    div.innerHTML = `
        <div class="input-group">
            <label>Mato</label>
            <select class="row-mat-id" style="background:transparent;">
                ${state.materials.map(m => `<option value="${m.id}">${m.name} (${m.stock}m)</option>`).join('')}
            </select>
        </div>
        <div class="input-group">
            <label>1 donaga sarf</label>
            <input type="number" class="row-mat-sarf" placeholder="0.0">
        </div>
        <div class="input-group">
            <label>1m Narxi</label>
            <input type="number" class="row-mat-price" placeholder="So'm">
        </div>
        <div class="remove-btn" onclick="window.removeRow('mat-row-${materialRowCounter}')">×</div>
    `;
    container.appendChild(div);
    materialRowCounter++;
}

let workerRowCounter = 0;
function addWorkerRow() {
    const container = document.getElementById('workerRowsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-row';
    div.id = `worker-row-${workerRowCounter}`;
    div.innerHTML = `
        <div class="input-group">
            <label>Ishchi Ismi</label>
            <input type="text" class="row-worker-name" placeholder="Ism">
        </div>
        <div class="input-group">
            <label>Bitirdi</label>
            <input type="number" class="row-worker-qty" placeholder="0">
        </div>
        <div class="input-group">
            <label>1 dona xaqqi</label>
            <input type="number" class="row-worker-price" placeholder="So'm">
        </div>
        <div class="remove-btn" onclick="window.removeRow('worker-row-${workerRowCounter}')">×</div>
    `;
    container.appendChild(div);
    workerRowCounter++;
}

// --- Universal Sklad Actions ---
function openAddModal() {
    const el = document.getElementById('universalAddForm');
    if (el) el.style.display = 'block';
}

// Deletion with Security
function deleteSkladItem(type, id) {
    secureDelete(() => {
        if (!confirm("Haqiqatdan ham ushbu tovarna bazadan o'chirmoqchimisiz?")) return;

        if (type === 'material') {
            state.materials = state.materials.filter(m => m.id !== id);
        } else if (type === 'product') {
            state.products = state.products.filter(p => p.id !== id);
        }

        updateUI();
        save();
    });
}

function submitUniversalAdd() {
    const type = document.getElementById('uType').value;
    const name = document.getElementById('uName').value.trim();
    const qty = parseFloat(document.getElementById('uQty').value) || 0;
    const price = parseInt(document.getElementById('uPrice').value) || 0;

    if (!name || isNaN(qty)) return alert("Ism va miqdorni kiriting!");

    if (type === 'material' || type === 'detail') {
        let mat = state.materials.find(m => m.name.toLowerCase() === name.toLowerCase());
        if (mat) {
            mat.stock += qty;
            mat.costPerUnit = price;
        } else {
            state.materials.push({
                id: 'm' + Date.now(),
                name: name, // Original casing for display
                stock: qty,
                unit: (type === 'material' ? 'm' : 'dona'),
                costPerUnit: price
            });
        }
    } else if (type === 'product') {
        let prod = state.products.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (prod) {
            prod.qty += qty;
            prod.costPrice = price;
        } else {
            state.products.push({ id: 'p' + Date.now(), name: name, qty: qty, costPrice: price });
        }
    }

    alert("Sklad: Tovar muvaffaqiyatli qo'shildi! ✅");
    console.log("Material/Product added to Sklad:", name);
    document.getElementById('universalAddForm').style.display = 'none';
    resetForms();
    updateUI(); // Instant update
    save();
}

// --- Logic Actions ---

function submitProduction() {
    const prodName = document.getElementById('prodName').value.trim();
    const totalQty = parseInt(document.getElementById('prodTotalQty').value);
    if (!prodName || !totalQty || totalQty <= 0) return alert("Mahsulot nomi va miqdorini to'g'ri kiriting!");

    // Gather Materials
    const matRows = document.querySelectorAll('#materialRowsContainer .dynamic-row');
    let materialsUsed = [];
    let matTotalCostForBatch = 0;

    for (let row of matRows) {
        const matIdEl = row.querySelector('.row-mat-id');
        const sarfEl = row.querySelector('.row-mat-sarf');
        const priceEl = row.querySelector('.row-mat-price');

        if (!matIdEl || !sarfEl || !priceEl) continue;

        const id = matIdEl.value;
        const sarf = parseFloat(sarfEl.value) || 0;
        const price = parseInt(priceEl.value) || 0;

        const mat = state.materials.find(m => m.id === id);
        if (!mat) continue;

        const totalUsed = totalQty * sarf;
        if (mat.stock < totalUsed) return alert(`${mat.name} yetarli emas!`);

        mat.stock -= totalUsed;
        materialsUsed.push({ name: mat.name, qty: totalUsed, price: price });
        matTotalCostForBatch += totalUsed * price;
    }

    const workerRows = document.querySelectorAll('#workerRowsContainer .dynamic-row');
    let workersDone = [];
    let laborTotalCost = 0;

    for (let row of workerRows) {
        const nameEl = row.querySelector('.row-worker-name');
        const qtyEl = row.querySelector('.row-worker-qty');
        const priceEl = row.querySelector('.row-worker-price');

        if (!nameEl || !qtyEl || !priceEl) continue;

        const name = nameEl.value.trim();
        const qty = parseInt(qtyEl.value) || 0;
        const price = parseInt(priceEl.value) || 0;

        if (name && qty > 0) {
            workersDone.push({ name, qty, price });
            laborTotalCost += qty * price;
        }
    }

    if (workersDone.length === 0) return alert("Kamida bitta ishchi va uning bajargan miqdorini kiriting!");

    const totalBatchExp = matTotalCostForBatch + laborTotalCost;
    const dateStr = state.filterDate || getTodayStr();
    if (!state.history[dateStr]) state.history[dateStr] = { production: [], sales: [] };

    state.history[dateStr].production.push({
        id: Date.now(),
        name: prodName, qty: totalQty, totalExp: totalBatchExp,
        matCost: matTotalCostForBatch, laborCost: laborTotalCost,
        materials: materialsUsed,
        workers: workersDone.map((w, idx) => ({ ...w, id: idx })),
        time: new Date().toLocaleTimeString()
    });

    // Update Overall Product Stock
    let existing = state.products.find(p => p.name === prodName);
    if (existing) {
        existing.qty += totalQty;
        existing.costPrice = ((existing.costPrice * (existing.qty - totalQty)) + totalBatchExp) / existing.qty;
    } else {
        state.products.push({ id: 'p' + Date.now(), name: prodName, qty: totalQty, costPrice: totalBatchExp / totalQty });
    }

    // Deduct only material cost from balance initially. 
    // Labor cost will be deducted when salary is paid.
    // state.totalBalance -= matTotalCostForBatch; // Removed as per instruction

    alert("Saqlandi!");
    resetForms();
    updateUI(); // Instant update
    save();
}

function submitSale() {
    const name = document.getElementById('saleProduct').value;
    const qty = parseInt(document.getElementById('saleQty').value);
    const price = parseInt(document.getElementById('salePrice').value);

    let prod = state.products.find(p => p.name === name);
    if (!prod || prod.qty < qty) return alert("Omborda yetarli emas!");

    prod.qty -= qty;
    const rev = qty * price;
    const cost = qty * prod.costPrice;
    const profit = rev - cost;

    const dateStr = state.filterDate || getTodayStr();
    if (!state.history[dateStr]) state.history[dateStr] = { production: [], sales: [] };
    state.history[dateStr].sales.push({ name, qty, price, profit, time: new Date().toLocaleTimeString() });

    state.totalBalance += rev;
    alert("Sotuv qayd etildi!");
    resetForms();
    updateUI(); // Instant update
    save();
}

function toggleSalaryPayment(taskId) {
    const dStr = state.filterDate;
    if (!state.history[dStr]) state.history[dStr] = { production: [], sales: [] };
    if (!state.history[dStr].paidWorkers) state.history[dStr].paidWorkers = [];

    if (state.history[dStr].paidWorkers.includes(taskId)) {
        return; // Already paid
    }

    // Find the task amount to deduct from balance
    const tasks = calculateSalaries(state.history[dStr]);
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        state.totalBalance -= task.total;
    }

    state.history[dStr].paidWorkers.push(taskId);
    updateUI();
    save();
}

// --- UI Rendering ---
function updateUI() {
    try {
        const dStr = state.filterDate;    // Display Date
        const displayDateEl = document.getElementById('currentDateDisplay');
        if (displayDateEl) displayDateEl.innerText = "Bugun: " + formatDateForUI(state.filterDate);

        // Update Notepad Ref if open
        const notepadField = document.getElementById('notepadTextarea');
        if (notepadField && document.getElementById('notepadDrawer')) {
            if (document.getElementById('notepadDrawer').classList.contains('active')) {
                notepadField.value = state.notepad || "";
            }
        }

        const dayData = state.history[dStr] || { production: [], sales: [] };

        // Dashboard
        const balEl = document.getElementById('todayProfit');
        if (balEl) {
            // Balans faqat jami sotuv (revenue) ni ko'rsatadi
            balEl.innerText = state.totalBalance.toLocaleString() + " So'm";
            balEl.className = 'stat-value positive'; // Har doim yashil/ijobiy
        }

        // Logic for Chiqim (Production Mat Costs + PAID Salaries)
        let dProdMatExp = dayData.production.reduce((a, b) => a + (b.matCost || 0), 0);
        let tasks = calculateSalaries(dayData);
        let paidTaskIds = dayData.paidWorkers || [];
        let paidSalAmount = 0;

        tasks.forEach(task => {
            if (paidTaskIds.includes(task.id)) paidSalAmount += task.total;
        });

        let totalTaskCount = tasks.length;
        let salaryPercent = totalTaskCount > 0 ? Math.round((paidTaskIds.length / totalTaskCount) * 100) : 0;

        let dRev = dayData.sales.reduce((a, b) => a + (b.qty * b.price), 0);
        let dTotalExp = dProdMatExp + paidSalAmount;
        let dProfit = dRev - dTotalExp;

        document.getElementById('todaySalesCount').innerText = dayData.sales.reduce((a, b) => a + b.qty, 0) + " dona";
        document.getElementById('todayExpense').innerText = dTotalExp.toLocaleString() + " So'm";
        document.getElementById('avgMargin').innerText = dProfit.toLocaleString() + " So'm";

        // Selects
        const saleProdSelect = document.getElementById('saleProduct');
        if (saleProdSelect) {
            saleProdSelect.innerHTML = state.products.filter(p => p.qty > 0).map(p => `<option value="${p.name}">${p.name} (${p.qty} dona)</option>`).join('');
        }

        // Sidebar Reports
        const prodRep = document.getElementById('productionReportItems');
        if (prodRep) prodRep.innerHTML = dayData.production.map(p => `<div class="report-item"><span>${p.name} (x${p.qty})</span> <span>-${(p.matCost || 0).toLocaleString()}</span></div>`).join('') || '<p style="font-size:0.8rem; opacity:0.6;">Yo\'q</p>';

        const salesRep = document.getElementById('salesReportItems');
        if (salesRep) salesRep.innerHTML = dayData.sales.map(s => `<div class="report-item"><span>${s.name} (x${s.qty})</span> <span>+${(s.qty * s.price).toLocaleString()}</span></div>`).join('') || '<p style="font-size:0.8rem; opacity:0.6;">Yo\'q</p>';

        // Sidebar Salaries %
        const salRep = document.getElementById('salariesBriefReport');
        if (salRep) {
            salRep.innerHTML = `
            <div class="report-item"><span>To'langan:</span> <b>${paidSalAmount.toLocaleString()}</b></div>
            <div class="report-item"><span>Progress:</span> <b class="${salaryPercent === 100 ? 'positive' : ''}">${salaryPercent}%</b></div>
        `;
        }

        document.getElementById('sideRevenue').innerText = dRev.toLocaleString();
        document.getElementById('sideExpense').innerText = dTotalExp.toLocaleString();
        document.getElementById('sideProfit').innerText = (dRev - dTotalExp).toLocaleString();

        // Sklad Render with Search
        const skladList = document.getElementById('sidebarList');
        const skladBanner = document.getElementById('skladTotalValueBanner');
        const skladTotalValueEl = document.getElementById('skladTotalValue');
        const searchTerm = (document.getElementById('skladSearch')?.value || "").toLowerCase();

        if (skladList) {
            if (state.currentInventoryTab === 'ready') {
                let totalSkladValue = 0;
                const filteredProducts = state.products.filter(p => p.name.toLowerCase().includes(searchTerm));

                skladList.innerHTML = filteredProducts.map((p) => {
                    const itemTotal = p.qty * (p.costPrice || 0);
                    totalSkladValue += itemTotal;
                    return `
                    <div class="inventory-item">
                        <div class="inventory-item-details">
                            <span>${p.name} <span class="item-badge ${p.qty > 5 ? 'badge-ok' : 'badge-low'}">${p.qty} dona</span></span>
                            <span class="inventory-item-cost">Donasi: ${(p.costPrice || 0).toLocaleString()} | Jami: ${itemTotal.toLocaleString()} So'm</span>
                        </div>
                        <button class="delete-icon-btn" onclick="deleteSkladItem('product', '${p.id}')">🗑️</button>
                    </div>
                `;
                }).join('') || `
                <div class="empty-state">
                    <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">✨</p>
                    <p>"${searchTerm}" bo'yicha hech narsa topilmadi</p>
                </div>
            `;

                if (skladBanner) {
                    skladBanner.style.display = 'flex';
                    skladTotalValueEl.innerText = totalSkladValue.toLocaleString() + " So'm";
                }
            } else {
                const filteredMaterials = state.materials.filter(m => m.name.toLowerCase().includes(searchTerm));
                skladList.innerHTML = filteredMaterials.map((m) => `
                <div class="inventory-item">
                    <span>${m.name} <span class="item-badge ${m.stock > 10 ? 'badge-ok' : 'badge-low'}">${m.stock} m</span></span>
                    <button class="delete-icon-btn" onclick="deleteSkladItem('material', '${m.id}')">🗑️</button>
                </div>
            `).join('') || `
                <div class="empty-state">
                    <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">📦</p>
                    <p>Bunday material mavjud emas</p>
                </div>
            `;

                if (skladBanner) skladBanner.style.display = 'none';
                skladTotalValueEl.innerText = "";
            }
        }

        // Refresh Production Selects if any are open
        document.querySelectorAll('.row-mat-id').forEach(select => {
            const currentVal = select.value;
            select.innerHTML = state.materials.map(m => `<option value="${m.id}" ${m.id === currentVal ? 'selected' : ''}>${m.name} (${m.stock}m)</option>`).join('');
        });

        // Workers & History
        renderDailySalaries();
        renderOjidaniya(); // New
        renderDetailedHistory();
        updateDatePicker();
    } catch (e) {
        console.error("UI update error:", e);
    }
}

function calculateSalaries(dayData) {
    let tasks = [];
    if (!dayData.production) return tasks;
    dayData.production.forEach((prod) => {
        const prodId = prod.id || ('legacy_' + prod.name);
        if (prod.workers) {
            prod.workers.forEach((w, wIdx) => {
                tasks.push({
                    id: `${prodId}_${wIdx}`,
                    name: w.name,
                    itemName: prod.name,
                    qty: w.qty,
                    price: w.price,
                    total: w.qty * (w.price || 0)
                });
            });
        }
    });
    return tasks;
}

function renderDailySalaries() {
    const dStr = state.filterDate;
    const dayData = state.history[dStr] || { production: [], sales: [] };
    const paidWorkers = dayData.paidWorkers || [];
    const tasks = calculateSalaries(dayData);

    const el = document.getElementById('dailySalariesList');
    if (el) el.innerHTML = tasks.map(task => {
        const isPaid = paidWorkers.includes(task.id);
        return `
            <div class="salary-item ${isPaid ? 'paid' : ''}">
                <div class="salary-main" style="flex: 1;">
                    <h4>${task.name} ${isPaid ? '✅' : ''}</h4>
                    <p>${task.itemName} (x${task.qty})</p>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="salary-amount">${task.total.toLocaleString()} So'm</div>
                    ${!isPaid ? `<button class="check-btn" onclick="toggleSalaryPayment('${task.id}')">✓</button>` : ''}
                </div>
            </div>
        `;
    }).join('') || '<p style="text-align:center; color:gray;">Bugun maoshlar yo\'q</p>';
}

function renderOjidaniya() {
    const el = document.getElementById('ojidaniyaList');
    if (!el) return;

    el.innerHTML = state.pendingWork.map(p => {
        const days = calculateDaysPassed(p.createdAt);
        return `
            <div class="ojidaniya-card">
                <div class="ojidaniya-info">
                    <h4>${p.workerName}</h4>
                    <p>${p.itemName} (x${p.qty})</p>
                </div>
                <div style="display:flex; align-items:center; gap:20px;">
                    <div class="ojidaniya-days">
                        <span class="days-count">${days}</span>
                        <span class="days-label">kun o'tdi</span>
                    </div>
                    <button class="check-btn" onclick="deletePendingWork(${p.id})" title="Bajarildi">✓</button>
                </div>
            </div>
        `;
    }).join('') || '<p style="text-align:center; color:gray; padding:2rem;">Kutishdagi ishlar hozircha yo\'q</p>';

    // Update Badge
    const badge = document.getElementById('ojidaniyaBadge');
    if (badge) {
        const count = state.pendingWork.length;
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderDetailedHistory() {
    const container = document.getElementById('historyDetailedList');
    if (!container) return;
    const dStr = state.filterDate;
    const dayData = state.history[dStr] || { production: [], sales: [] };

    if (state.currentHistoryTab === 'prod_hist') {
        // Strictly PRODUCTION ONLY
        const prodData = dayData.production || [];
        container.innerHTML = prodData.map(p => `
            <div class="history-card">
                <div class="history-header"><h4>${p.name || 'Nomsiz'}</h4> <span>${p.time || ''}</span></div>
                <div class="history-details">
                    <div class="history-sub-item"><span>Umumiy soni:</span> <b>${p.qty || 0} dona</b></div>
                    <div class="history-sub-item"><span>Ishchilar:</span> <b>${(p.workers || []).map(w => w.name).join(', ')}</b></div>
                    <div class="history-sub-item"><span>Jami xarajat:</span> <b>${(p.totalExp || 0).toLocaleString()} So'm</b></div>
                </div>
            </div>
        `).join('') || '<p style="text-align:center; color:gray; padding:2rem;">Ishlab chiqarish tarixi bo\'sh</p>';
    } else if (state.currentHistoryTab === 'sales_hist') {
        // Strictly SALES ONLY
        const salesData = dayData.sales || [];
        container.innerHTML = salesData.map(s => `
            <div class="history-card">
                <div class="history-header"><h4>${s.name || 'Nomsiz'}</h4> <span>${s.time || ''}</span></div>
                <div class="history-details">
                    <div class="history-sub-item"><span>Sotildi:</span> <b>${s.qty || 0} dona</b></div>
                    <div class="history-sub-item"><span>Narxi:</span> <b>${(s.price || 0).toLocaleString()} So'm</b></div>
                    <div class="history-sub-item"><span>Sof foyda:</span> <b style="color:var(--accent-emerald)">${(s.profit || 0).toLocaleString()} So'm</b></div>
                </div>
            </div>
        `).join('') || '<p style="text-align:center; color:gray; padding:2rem;">Sotuvlar tarixi bo\'sh</p>';
    } else if (state.currentHistoryTab === 'worker_hist') {
        const workerSearch = (document.getElementById('workerHistorySearch')?.value || "").toLowerCase().trim();
        let html = '';

        const renderWorkerCard = (t, dateKey, isPaid) => `
            <div class="history-card ${isPaid ? 'paid-border' : ''}">
                <div class="history-header">
                    <h4>${t.itemName} (Sana: ${formatDateForUI(dateKey)}) ${isPaid ? '✅' : '⏳'}</h4>
                </div>
                <div class="history-details">
                     <p style="font-size:0.95rem; line-height:1.5; color:rgba(255,255,255,0.9); margin-bottom:10px;">
                        <b>Ishchilar va ularning hissasi:</b>
                     </p>
                     ${t.sharedWorkers.map(w => `
                        <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px; margin-bottom:5px; font-size:0.85rem;">
                            <b>${w.name}</b> ${w.qty} dona tikdi. 
                            Har biri uchun ${(w.price || 0).toLocaleString()} So'mdan, 
                            jami <b>${(w.qty * w.price).toLocaleString()} So'm</b>.
                        </div>
                     `).join('')}
                </div>
            </div>
        `;

        if (workerSearch.length > 0) {
            let allResults = [];
            Object.keys(state.history).forEach(dateKey => {
                const day = state.history[dateKey];
                (day.production || []).forEach(prod => {
                    if (prod.workers.some(w => w.name.toLowerCase().includes(workerSearch))) {
                        const isPaid = (day.paidWorkers || []).some(id => id.startsWith(prod.id));
                        allResults.push({ itemName: prod.name, sharedWorkers: prod.workers, date: dateKey, isPaid, id: prod.id });
                    }
                });
            });

            allResults.sort((a, b) => b.id - a.id);
            html = allResults.map(r => renderWorkerCard(r, r.date, r.isPaid)).join('');
        } else {
            const currentDayProds = dayData.production || [];
            html = currentDayProds.map(prod => {
                const isPaid = (dayData.paidWorkers || []).some(id => id.startsWith(prod.id));
                return renderWorkerCard({ itemName: prod.name, sharedWorkers: prod.workers }, dStr, isPaid);
            }).join('') || '<p style="text-align:center; color:gray; padding:2rem;">Bugun ishchilar faoliyati yo\'q</p>';
        }
        container.innerHTML = html;
    }
}

function updateDatePicker() {
    const datePicker = document.getElementById('historyDatePicker');
    if (!datePicker) return;

    // Barcha mavjud sanalarni yig'amiz
    const historicalDates = Object.keys(state.history || {});
    const today = getTodayStr();

    // Duplikat bo'lmasligi uchun Set ishlatamiz
    const allDates = new Set([today, ...historicalDates]);
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    const dates = Object.keys(state.history).sort((a, b) => {
        const [d1, m1, y1] = a.split('-').map(Number);
        const [d2, m2, y2] = b.split('-').map(Number);
        return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
    });

    let options = '';
    dates.forEach(d => {
        const uiDate = formatDateForUI(d);
        options += `<option value="${d}">${d === today ? 'Bugun (' + uiDate + ')' : uiDate}</option>`;
    });

    datePicker.innerHTML = options;
    datePicker.value = state.filterDate;
}

// Connection State Listener (Real-time feedback)
db.ref(".info/connected").on("value", (snap) => {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    if (snap.val() === true) {
        el.innerHTML = '<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Bulut bilan ulangan';
        el.style.color = '#10b981';
    } else {
        el.innerHTML = '<span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span> Tarmoq uzildi...';
        el.style.color = '#ef4444';
    }
});

function filterHistoryByDate(val) {
    state.filterDate = val || getTodayStr();
    updateUI();
}

function resetForms() {
    // Clear simple inputs
    ['prodName', 'prodTotalQty', 'saleQty', 'salePrice', 'uName', 'uQty', 'uPrice'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const matCont = document.getElementById('materialRowsContainer');
    if (matCont) matCont.innerHTML = '';
    const workCont = document.getElementById('workerRowsContainer');
    if (workCont) workCont.innerHTML = '';

    addMaterialRow();
    addWorkerRow();
}

function toggleDetail(d, btn) {
    // This function is no longer used as state.selectedDetails was removed.
    // Keeping it as a placeholder or removing it entirely depends on future requirements.
    // For now, it's effectively garbage code based on the state change.
}

async function exportToExcel() {
    const dStr = state.filterDate;
    const dayData = state.history[dStr] || { production: [], sales: [] };

    // 1. Calculate Summary for Chart
    const tasks = calculateSalaries(dayData);
    const paidTaskIds = dayData.paidWorkers || [];
    let paidSalAmount = 0;
    tasks.forEach(task => {
        if (paidTaskIds.includes(task.id)) paidSalAmount += task.total;
    });
    const matExp = dayData.production.reduce((a, b) => a + (b.matCost || 0), 0);
    const revenue = dayData.sales.reduce((a, b) => a + (b.qty * b.price), 0);
    const totalExp = matExp + paidSalAmount;
    const netProfit = revenue - totalExp;

    // 2. Generate Chart Image via Chart.js
    const canvas = document.getElementById('exportChartCanvas');
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Mato Xarajati', 'To\'langan Maosh', 'Sof Foyda'],
            datasets: [{
                data: [matExp, paidSalAmount, netProfit > 0 ? netProfit : 0],
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                title: { display: true, text: `Moliyaviy Holat (${dStr})`, font: { size: 18 } },
                legend: { position: 'bottom' }
            }
        }
    });

    // Wait for chart to render and get base64
    await new Promise(r => setTimeout(r, 500));
    const chartImage = canvas.toDataURL('image/png');
    chart.destroy();

    // 3. Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Calibri ERP';
    workbook.created = new Date();

    // Helper for Premium Styling
    const applyPremiumStyle = (sheet) => {
        sheet.getRow(1).height = 25;
        sheet.getRow(1).eachCell(cell => {
            cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Deep Navy
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Zebra Striping & Borders
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const isEven = rowNumber % 2 === 0;
                row.eachCell(cell => {
                    cell.font = { name: 'Segoe UI', size: 10 };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    if (isEven) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // Very light blue/gray
                    }
                });
            }
        });
    };

    // --- SHEET 1: DASHBOARD ---
    const dashSheet = workbook.addWorksheet('Dashboard');
    dashSheet.getColumn(2).width = 25;
    dashSheet.getColumn(3).width = 20;

    dashSheet.mergeCells('B2:C2');
    const titleCell = dashSheet.getCell('B2');
    titleCell.value = `KUNLIK HISOBOT: ${dStr}`;
    titleCell.font = { name: 'Arial Black', size: 16, color: { argb: 'FF1F2937' } };
    titleCell.alignment = { horizontal: 'center' };

    const summaryData = [
        ['Ko\'rsatkich', 'Qiymat'],
        ['Umumiy Kirim (Sotuv)', revenue],
        ['Mato Xarajatlari', matExp],
        ['To\'langan Maoshlar', paidSalAmount],
        ['Jami Chiqim', totalExp],
        ['Sof Foyda', netProfit]
    ];

    dashSheet.addRows(new Array(3).fill([])); // Spacing
    summaryData.forEach((row, i) => {
        const r = dashSheet.addRow(['', row[0], row[1]]);
        const cell1 = r.getCell(2);
        const cell2 = r.getCell(3);

        if (i === 0) {
            cell1.fill = cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell1.font = cell2.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Segoe UI' };
        } else {
            cell2.numFmt = '#,##0 "So\'m"';
            if (row[0] === 'Sof Foyda') {
                cell2.font = { bold: true, color: { argb: netProfit >= 0 ? 'FF10B981' : 'FFEF4444' } };
            }
        }
        cell1.border = cell2.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Add Chart Image to Excel
    const imageId = workbook.addImage({
        base64: chartImage,
        extension: 'png',
    });
    dashSheet.addImage(imageId, {
        tl: { col: 4.5, row: 4 },
        ext: { width: 400, height: 300 }
    });

    // --- SHEET 2: SALES ---
    const salesSheet = workbook.addWorksheet('Sotuvlar');
    salesSheet.columns = [
        { header: 'Vaqt', key: 'time', width: 12 },
        { header: 'Nomi', key: 'name', width: 25 },
        { header: 'Soni', key: 'qty', width: 10 },
        { header: 'Narxi (dona)', key: 'price', width: 20 },
        { header: 'Jami Summa', key: 'total', width: 20 }
    ];
    const fmt = (val) => Number(val).toLocaleString() + " So'm";

    dayData.sales.forEach(s => {
        salesSheet.addRow({
            time: s.time, name: s.name, qty: s.qty,
            price: fmt(s.price),
            total: fmt(s.qty * s.price)
        });
    });

    applyPremiumStyle(salesSheet);

    // --- SHEET 3: PRODUCTION ---
    const prodSheet = workbook.addWorksheet('Ishlab Chiqarish');
    prodSheet.columns = [
        { header: 'Mahsulot', key: 'name', width: 25 },
        { header: 'Soni', key: 'qty', width: 10 },
        { header: 'Mato Xarajati', key: 'mat', width: 20 },
        { header: 'Ishchilar', key: 'workersNames', width: 30 },
        { header: '1 dona uchun', key: 'rate', width: 15 },
        { header: 'Ishchi Xaqqi', key: 'labor', width: 20 },
        { header: 'Jami Xarajat', key: 'total', width: 20 }
    ];
    dayData.production.forEach(p => {
        const workers = p.workers || [];

        // Helper to format currency strings exactly as requested
        const fmt = (val) => Number(val).toLocaleString() + " So'm";

        if (workers.length === 0) {
            prodSheet.addRow({
                name: p.name,
                qty: p.qty,
                mat: fmt(p.matCost || 0),
                workersNames: "",
                rate: "",
                labor: fmt(0),
                total: fmt(p.totalExp)
            });
        } else {
            workers.forEach((w, idx) => {
                const laborVal = w.qty * w.price;
                if (idx === 0) {
                    // First row: include product info and mat/total খরচ
                    prodSheet.addRow({
                        name: p.name,
                        qty: p.qty,
                        mat: fmt(p.matCost || 0),
                        workersNames: `${w.name} (${w.qty})`,
                        rate: fmt(w.price),
                        labor: fmt(laborVal),
                        total: fmt(p.totalExp)
                    });
                } else {
                    // Subsequent rows: only worker specific info
                    prodSheet.addRow({
                        name: "",
                        qty: "",
                        mat: "",
                        workersNames: `${w.name} (${w.qty})`,
                        rate: fmt(w.price),
                        labor: fmt(laborVal),
                        total: ""
                    });
                }
            });
        }
    });

    applyPremiumStyle(prodSheet);

    // 4. Save File
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Calibri_Report_${dStr.replaceAll('-', '_')}.xlsx`);
    console.log("Excel export success!");
}

// --- Ultra-Premium Security Phase ---
const MASTER_PIN = "7777";

function checkSecurity(callback) {
    const pin = prompt("Xavfsizlik parolini kiriting (Master PIN):");
    if (pin === MASTER_PIN) {
        callback();
    } else {
        alert("Xavfsizlik paroli noto'g'ri! Amallarga ruxsat berilmadi.");
    }
}

// --- AI Notepad Logic ---
let aiMessages = [];

function initAiChat() {
    if (state.aiMessages && state.aiMessages.length > 0) {
        aiMessages = [...state.aiMessages];
    } else {
        aiMessages = [
            { role: 'bot', text: 'Salom! Men sizning aqlli yordamchingizman. Sklad, ojidaniya yoki buyurtmalar haqida so\'rashingiz mumkin.' }
        ];
    }
}

function switchNotepadTab(tab) {
    document.querySelectorAll('.premium-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.notepad-tab-content').forEach(c => c.classList.remove('active'));

    if (tab === 'text') {
        document.getElementById('tabTextBtn').classList.add('active');
        document.getElementById('notepadTextContent').classList.add('active');
    } else {
        document.getElementById('tabAiBtn').classList.add('active');
        document.getElementById('notepadAiContent').classList.add('active');
        renderAiChat();
    }
}

function handleAiKey(e) {
    if (e.key === 'Enter') askAi();
}

function askAi() {
    const input = document.getElementById('aiInput');
    const text = input.value.trim();
    if (!text) return;

    aiMessages.push({ role: 'user', text });
    input.value = '';
    renderAiChat();

    state.aiMessages = aiMessages;
    save();

    // Show Typing Indicator
    const indicator = document.getElementById('aiTypingIndicator');
    if (indicator) indicator.style.display = 'flex';

    // AI "Thinking" and Response
    setTimeout(() => {
        if (indicator) indicator.style.display = 'none';
        const response = generateAiResponse(text);
        aiMessages.push({ role: 'bot', text: response });
        state.aiMessages = aiMessages;
        save();
        renderAiChat();
    }, 1200); // Longer delay for "premium" feel
}

function renderAiChat() {
    const history = document.getElementById('aiChatHistory');
    if (!history) return;
    history.innerHTML = aiMessages.map(m => `
        <div class="ai-message ${m.role}">
            <b>${m.role === 'bot' ? 'Calibri AI' : 'Siz'}:</b> ${m.text}
        </div>
    `).join('');
    history.scrollTop = history.scrollHeight;
}

// Final personality polish
function generateAiResponse(query) {
    const q = query.toLowerCase();

    // Financial & State Knowledge
    const revenue = state.totalBalance;
    const inventoryCount = state.products.length;
    const pendingCount = state.pendingWork.length;

    // Greeting & Identity
    if (q.includes('salom') || q.includes('assalom')) return "Salom! Men Calibri Super-AI tizimiman. Sizning biznesingizni 24/7 nazorat qilyapman. Qanday professional yordam bera olaman?";
    if (q.includes('kimsa') || q.includes('ismin')) return "Men Calibri ERP tizimining 'Super-Intelligence' yadrosiman. Mening IQ darajam istalgan murakkab savollarga javob berishga yetadi.";

    // Analytical Mode
    if (q.includes('maslahat') || q.includes('tahlil') || q.includes('holat')) {
        let advice = `Hozirgi holat tahlili:\n1. Balansingiz: ${revenue.toLocaleString()} So'm. `;
        if (revenue < 1000000) advice += "Sotuvlarni jadallashtirishni maslahat beraman.\n";
        else advice += "Moliya holati barqaror.\n";

        advice += `2. Ombor: ${inventoryCount} turdagi tovar bor. `;
        if (inventoryCount < 3) advice += "Assortimentni ko'paytirish zarur.\n";

        advice += `3. Ojidaniya: ${pendingCount} ta ish kutilmoqda. `;
        if (pendingCount > 5) advice += "Ishchilarni tezlashtirish kerak, yuklama ko'p.";

        return advice;
    }

    // ERP Specifics
    if (q.includes('sklad') || q.includes('tovar')) {
        const totalItems = state.products.reduce((a, b) => a + b.qty, 0);
        return `Skladda hozirda ${inventoryCount} turdagi, jami ${totalItems} dona tayyor mahsulot bor. `;
    }

    if (q.includes('balans') || q.includes('pul')) return `Hozirgi jami balansingiz: ${revenue.toLocaleString()} So'm. `;

    // General Knowledge / High Intelligence
    if (q.includes('nima qila olasan') || q.includes('vazifang')) {
        return "Men quyidagilarni qila olaman:\n- Biznesingizni sekundiga tahlil qilish.\n- Moliyaviy maslahatlar berish.\n- Har qanday umumiy savollarga (fan, texnika, hayot) javob berish.\n- Strategik rejalashtirishda yordam berish.";
    }

    // Default High-IQ Response
    return "Tushundim. Bu masala bo'yicha tahlil o'tkazdim. Fikrimcha, biznesingizdagi har bir detalga e'tiborli bo'lishingiz kerak. Agar aniqroq savol bersangiz, chuqurroq tahlil qilib beraman. Men sizga nafaqat bu dasturda, balki hayotiy va biznes strategiyalarida ham yordam bera olaman.";
}

function toggleNotepad() {
    const drawer = document.getElementById('notepadDrawer');
    const overlay = document.getElementById('notepadOverlay');
    if (drawer && overlay) {
        drawer.classList.toggle('active');
        overlay.classList.toggle('active');

        if (drawer.classList.contains('active')) {
            document.getElementById('notepadTextarea').value = state.notepad || "";
        }
    }
}

function saveNotepad() {
    state.notepad = document.getElementById('notepadTextarea').value;
    save();
}

// System Backup: Export entire state as JSON
function exportSystemBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Calibri_Full_Backup_${getTodayStr()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    alert("Tizimning to'liq nusxasi (Backup) yuklab olindi! 💾");
}

function resetEntireDatabase() {
    checkSecurity(() => {
        if (confirm("DIQQAT! Barcha ma'lumotlar butunlay o'chib ketadi. Rozimisiz?")) {
            state = JSON.parse(JSON.stringify(DEFAULT_STATE));
            save();
            updateUI();
            alert("Baza butunlay tozalandi! 🧹");
        }
    });
}

// Wrapper for sensitive deletes
function secureDelete(callback) {
    checkSecurity(callback);
}

// Init
window.onload = () => {
    initAiChat();
    addMaterialRow();
    addWorkerRow();
    updateUI();
    // Default to production view safely
    const prodBtn = document.querySelector('.nav-buttons button');
    if (prodBtn) showView('production', prodBtn);
    renderAiChat(); // In case AI tab is active
};
