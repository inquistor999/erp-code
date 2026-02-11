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
let state = {
    materials: [
        { id: 'm1', name: 'Paxta', stock: 100, unit: 'm', costPerUnit: 15000 },
        { id: 'm2', name: 'Ipak', stock: 50, unit: 'm', costPerUnit: 45000 }
    ],
    products: [],
    history: {},
    totalBalance: 0,
    currentInventoryTab: 'ready',
    currentHistoryTab: 'prod_hist',
    filterDate: getTodayStr()
};

function getTodayStr() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// Persistence (Transition from Local to Cloud)
let isInitialLoad = true;

dbRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        state = data;
        // Muhim: filterDate har doim bugun bo'lishi kerak yoki saqlangan sana
        if (!state.filterDate) state.filterDate = getTodayStr();
        updateUI();
        console.log("Cloud Data Synced ✅");
    } else if (isInitialLoad) {
        // Agar baza bo'sh bo'lsa, hozirgi default state-ni saqlaymiz (faqat birinchi marta)
        console.log("Database is empty, initializing with defaults...");
        save();
    }
    isInitialLoad = false;
});

// Sync Status Indicator & Error Handling
db.ref(".info/connected").on("value", (snap) => {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    if (snap.val() === true) {
        el.innerHTML = '<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Bulut bilan ulangan';
        el.style.color = '#10b981';
    } else {
        el.innerHTML = '<span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span> Tarmoq uzildi yoki ulanish kutilmoqda...';
        el.style.color = '#ef4444';
    }
});

function save() {
    // Agar dastur hali yuklanmagan bo'lsa saqlamaymiz (ma'lumot o'chib ketishidan himoya)
    if (isInitialLoad && !dbRef) return;

    dbRef.set(state).then(() => {
        console.log("Data Saved to Cloud ☁️");
    }).catch(err => {
        console.error("Cloud Save Error:", err);
        if (err.code === 'PERMISSION_DENIED') {
            alert("Xato: Firebase Rules (Qoidalar) qismida .read va .write ni 'true' qilishingiz kerak!");
        } else {
            alert("Saqlashda xatolik: " + err.message);
        }
    });
}

// --- Navigation ---
function showView(viewId, btn) {
    if (!btn) return;
    document.querySelectorAll('.nav-buttons .btn-thin').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const views = ['productionView', 'salesView', 'salariesView', 'skladView', 'tarixView'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === viewId + 'View') ? 'block' : 'none';
    });

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

function deleteSkladItem(type, index) {
    if (!confirm("Haqiqatdan ham ushbu tovarni bazadan o'chirmoqchimisiz?")) return;

    if (type === 'material') {
        state.materials.splice(index, 1);
    } else if (type === 'product') {
        state.products.splice(index, 1);
    }

    save();
}

function submitUniversalAdd() {
    const type = document.getElementById('uType').value;
    const name = document.getElementById('uName').value;
    const qty = parseFloat(document.getElementById('uQty').value);
    const price = parseInt(document.getElementById('uPrice').value);

    if (!name || isNaN(qty)) return alert("Ma'lumotlar to'liq emas!");

    if (type === 'material') {
        let mat = state.materials.find(m => m.name.toLowerCase() === name.toLowerCase());
        if (mat) { mat.stock += qty; mat.costPerUnit = price; }
        else state.materials.push({ id: 'm' + Date.now(), name, stock: qty, unit: 'm', costPerUnit: price });
    } else if (type === 'product') {
        let prod = state.products.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (prod) { prod.qty += qty; prod.costPrice = price; }
        else state.products.push({ name, qty, costPrice: price });
    }

    alert("Saqlandi!");
    document.getElementById('universalAddForm').style.display = 'none';
    resetForms(); // Clear universal add too
    save();
}

// --- Logic Actions ---

function submitProduction() {
    const prodName = document.getElementById('prodName').value;
    const totalQty = parseInt(document.getElementById('prodTotalQty').value);
    if (!prodName || !totalQty) return alert("Nom va sonini kiriting!");

    // Gather Materials
    const matRows = document.querySelectorAll('#materialRowsContainer .dynamic-row');
    let materialsUsed = [];
    let matTotalCostForBatch = 0;

    for (let row of matRows) {
        const id = row.querySelector('.row-mat-id').value;
        const sarf = parseFloat(row.querySelector('.row-mat-sarf').value);
        const price = parseInt(row.querySelector('.row-mat-price').value);

        const mat = state.materials.find(m => m.id === id);
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
        const name = row.querySelector('.row-worker-name').value;
        const qty = parseInt(row.querySelector('.row-worker-qty').value);
        const price = parseInt(row.querySelector('.row-worker-price').value);
        workersDone.push({ name, qty, price });
        laborTotalCost += qty * price;
    }

    const totalBatchExp = matTotalCostForBatch + laborTotalCost;
    const dateStr = getTodayStr();
    if (!state.history[dateStr]) state.history[dateStr] = { production: [], sales: [] };

    state.history[dateStr].production.push({
        name: prodName, qty: totalQty, totalExp: totalBatchExp,
        matCost: matTotalCostForBatch, laborCost: laborTotalCost,
        materials: materialsUsed, workers: workersDone, time: new Date().toLocaleTimeString()
    });

    // Update Overall Product Stock
    let existing = state.products.find(p => p.name === prodName);
    if (existing) {
        existing.qty += totalQty;
        existing.costPrice = ((existing.costPrice * (existing.qty - totalQty)) + totalBatchExp) / existing.qty;
    } else {
        state.products.push({ name: prodName, qty: totalQty, costPrice: totalBatchExp / totalQty });
    }

    // Deduct only material cost from balance initially. 
    // Labor cost will be deducted when salary is paid.
    // state.totalBalance -= matTotalCostForBatch; // Removed as per instruction

    alert("Saqlandi!");
    resetForms();
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

    const dateStr = getTodayStr();
    if (!state.history[dateStr]) state.history[dateStr] = { production: [], sales: [] };
    state.history[dateStr].sales.push({ name, qty, price, profit, time: new Date().toLocaleTimeString() });

    state.totalBalance += rev;
    alert("Sotuv qayd etildi!");
    resetForms();
    save();
}

function toggleSalaryPayment(workerName, amount) {
    const dStr = state.filterDate;
    if (!state.history[dStr]) state.history[dStr] = { production: [], sales: [] };
    if (!state.history[dStr].paidWorkers) state.history[dStr].paidWorkers = [];

    if (state.history[dStr].paidWorkers.includes(workerName)) {
        // Already paid, what if we want to undo?
        // User didn't specify undo, but let's keep it simple.
        return;
    }

    state.history[dStr].paidWorkers.push(workerName);
    state.totalBalance -= amount;
    save();
}

// --- UI Rendering ---
function updateUI() {
    const dStr = state.filterDate;
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) dateDisplay.innerText = `Sana: ${dStr}`;

    const dayData = state.history[dStr] || { production: [], sales: [] };

    // Dashboard
    const balEl = document.getElementById('todayProfit');
    if (balEl) {
        balEl.innerText = state.totalBalance.toLocaleString() + " So'm";
        balEl.className = 'stat-value ' + (state.totalBalance < 0 ? 'negative' : 'positive');
    }

    // Logic for Chiqim (Production Mat Costs + PAID Salaries)
    let dProdMatExp = dayData.production.reduce((a, b) => a + (b.matCost || 0), 0);
    let salaries = calculateSalaries(dayData);
    let paidWorkers = dayData.paidWorkers || [];
    let paidSalAmount = 0;
    Object.keys(salaries).forEach(name => {
        if (paidWorkers.includes(name)) paidSalAmount += salaries[name].total;
    });

    let totalWorkerCount = Object.keys(salaries).length;
    let salaryPercent = totalWorkerCount > 0 ? Math.round((paidWorkers.length / totalWorkerCount) * 100) : 0;

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

    // Sklad Render
    const skladList = document.getElementById('sidebarList');
    if (skladList) {
        if (state.currentInventoryTab === 'ready') {
            skladList.innerHTML = state.products.map((p, idx) => `
                <div class="inventory-item">
                    <span>${p.name} <span class="item-badge ${p.qty > 5 ? 'badge-ok' : 'badge-low'}">${p.qty} dona</span></span>
                    <button class="delete-icon-btn" onclick="deleteSkladItem('product', ${idx})">🗑️</button>
                </div>
            `).join('');
        } else {
            skladList.innerHTML = state.materials.map((m, idx) => `
                <div class="inventory-item">
                    <span>${m.name} <span class="item-badge ${m.stock > 10 ? 'badge-ok' : 'badge-low'}">${m.stock} m</span></span>
                    <button class="delete-icon-btn" onclick="deleteSkladItem('material', ${idx})">🗑️</button>
                </div>
            `).join('');
        }
    }

    // Refresh Production Selects if any are open
    document.querySelectorAll('.row-mat-id').forEach(select => {
        const currentVal = select.value;
        select.innerHTML = state.materials.map(m => `<option value="${m.id}" ${m.id === currentVal ? 'selected' : ''}>${m.name} (${m.stock}m)</option>`).join('');
    });

    // Workers & History
    renderDailySalaries();
    renderDetailedHistory();
    updateDatePicker();
}

function calculateSalaries(dayData) {
    let salaries = {};
    dayData.production.forEach(row => {
        row.workers.forEach(w => {
            if (!salaries[w.name]) salaries[w.name] = { qty: 0, total: 0 };
            salaries[w.name].qty += w.qty;
            salaries[w.name].total += w.qty * w.price;
        });
    });
    return salaries;
}

function renderDailySalaries() {
    const dStr = state.filterDate;
    const dayData = state.history[dStr] || { production: [], sales: [] };
    const paidWorkers = dayData.paidWorkers || [];
    const salaries = calculateSalaries(dayData);

    const el = document.getElementById('dailySalariesList');
    if (el) el.innerHTML = Object.keys(salaries).map(name => {
        const isPaid = paidWorkers.includes(name);
        return `
            <div class="salary-item ${isPaid ? 'paid' : ''}">
                <div class="salary-main">
                    <h4>${name} ${isPaid ? '✅' : ''}</h4>
                    <p>Tikkan: ${salaries[name].qty} dona</p>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="salary-amount">${salaries[name].total.toLocaleString()} So'm</div>
                    ${!isPaid ? `<button class="check-btn" onclick="toggleSalaryPayment('${name}', ${salaries[name].total})">✓</button>` : ''}
                </div>
            </div>
        `;
    }).join('') || '<p style="text-align:center; color:gray;">Bugun maoshlar yo\'q</p>';
}

function renderDetailedHistory() {
    const container = document.getElementById('historyDetailedList');
    if (!container) return;
    const dStr = state.filterDate;
    const dayData = state.history[dStr] || { production: [], sales: [] };

    if (state.currentHistoryTab === 'prod_hist') {
        container.innerHTML = dayData.production.map(p => `
            <div class="history-card">
                <div class="history-header"><h4>${p.name}</h4> <span>${p.time}</span></div>
                <div class="history-details">
                    <div class="history-sub-item"><span>Umumiy soni:</span> <b>${p.qty} dona</b></div>
                    <div class="history-sub-item"><span>Materiallar:</span> <b>${p.materials.map(m => m.name).join(', ')}</b></div>
                    <div class="history-sub-item"><span>Ishchilar:</span> <b>${p.workers.map(w => w.name + '(' + w.qty + ')').join(', ')}</b></div>
                    <div class="history-sub-item"><span>Jami xarajat:</span> <b>${p.totalExp.toLocaleString()} So'm</b></div>
                </div>
            </div>
        `).join('') || '<p style="text-align:center; color:gray; padding:2rem;">Ishlab chiqarish tarixi bo\'sh</p>';
    } else {
        container.innerHTML = dayData.sales.map(s => `
            <div class="history-card">
                <div class="history-header"><h4>${s.name}</h4> <span>${s.time}</span></div>
                <div class="history-details">
                    <div class="history-sub-item"><span>Sotildi:</span> <b>${s.qty} dona</b></div>
                    <div class="history-sub-item"><span>Narxi:</span> <b>${s.price.toLocaleString()} So'm</b></div>
                    <div class="history-sub-item"><span>Sof foyda:</span> <b style="color:var(--accent-emerald)">${s.profit.toLocaleString()} So'm</b></div>
                </div>
            </div>
        `).join('') || '<p style="text-align:center; color:gray; padding:2rem;">Sotuvlar tarixi bo\'sh</p>';
    }
}

function updateDatePicker() {
    const datePicker = document.getElementById('historyDatePicker');
    if (!datePicker) return;
    const dates = Object.keys(state.history).sort().reverse();
    const today = getTodayStr();
    let options = `<option value="${today}">Bugun (${today})</option>`;
    dates.forEach(d => {
        if (d !== today) options += `<option value="${d}">${d}</option>`;
    });
    datePicker.innerHTML = options;
    datePicker.value = state.filterDate;
}

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
    const salaries = calculateSalaries(dayData);
    const paidWorkers = dayData.paidWorkers || [];
    let paidSalAmount = 0;
    Object.keys(salaries).forEach(name => {
        if (paidWorkers.includes(name)) paidSalAmount += salaries[name].total;
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
            cell1.fill = cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
            cell1.font = cell2.font = { color: { argb: 'FFFFFFFF' }, bold: true };
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
    dayData.sales.forEach(s => {
        salesSheet.addRow({
            time: s.time, name: s.name, qty: s.qty, price: s.price,
            total: s.qty * s.price
        });
    });
    salesSheet.getRow(1).font = { bold: true };
    salesSheet.getColumn(4).numFmt = salesSheet.getColumn(5).numFmt = '#,##0 "So\'m"';

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
        const workersNames = (p.workers || []).map(w => `${w.name} (${w.qty})`).join(', ');
        // Format rate strings with "So'm" for display
        const ratePerPiece = (p.workers || []).map(w => `${Number(w.price).toLocaleString()} So'm`).join(', ');

        prodSheet.addRow({
            name: p.name, qty: p.qty, mat: p.matCost || 0,
            workersNames: workersNames,
            rate: ratePerPiece,
            labor: p.laborCost || 0, total: p.totalExp
        });
    });
    prodSheet.getRow(1).font = { bold: true };
    // Apply number format to numeric columns
    prodSheet.getColumn(3).numFmt = prodSheet.getColumn(6).numFmt = prodSheet.getColumn(7).numFmt = '#,##0 "So\'m"';

    // 4. Save File
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Calibri_Report_${dStr.replace(/\./g, '_')}.xlsx`);
    console.log("Excel export success!");
}

// Global Help Functions
window.removeRow = (id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
};

// Init
window.onload = () => {
    addMaterialRow();
    addWorkerRow();
    updateUI();
};
