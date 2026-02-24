const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Material = require('../models/Material');
const History = require('../models/History');
const GlobalState = require('../models/GlobalState');

// Middleware: Check if DB is connected before any query
function checkDB(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ message: 'Database connecting...' });
    }
    next();
}

router.use(checkDB);

// --- Global State (Balance, Pending, Notepad) ---
router.get('/global-state', async (req, res) => {
    try {
        let state = await GlobalState.findOne({ key: 'main_state' });
        if (!state) {
            state = await GlobalState.create({ key: 'main_state' });
        }
        res.json(state);
    } catch (err) {
        console.error('GET /global-state error:', err.message);
        res.json({ totalBalance: 0, pendingWork: [], notepad: "" });
    }
});

// --- Products (Sklad) ---
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().lean();
        res.json(products);
    } catch (err) {
        console.error('GET /products error:', err.message);
        res.json([]);
    }
});

// --- Materials ---
router.get('/materials', async (req, res) => {
    try {
        const materials = await Material.find().lean();
        res.json(materials);
    } catch (err) {
        console.error('GET /materials error:', err.message);
        res.json([]);
    }
});

// --- History ---
router.get('/history', async (req, res) => {
    try {
        const history = await History.find().lean();
        res.json(history);
    } catch (err) {
        console.error('GET /history error:', err.message);
        res.json([]);
    }
});

// --- Bulk Sync (Optimized for Collaboration) ---
router.post('/sync-all', async (req, res) => {
    const { products, materials, history, globalState } = req.body;
    const errors = [];
    try {
        // 1. Sync Products
        if (products && Array.isArray(products)) {
            for (const p of products) {
                try {
                    if (p.id) await Product.findOneAndUpdate({ id: p.id }, p, { upsert: true });
                } catch (e) { errors.push(`Product ${p.id}: ${e.message}`); }
            }
        }
        // 2. Sync Materials
        if (materials && Array.isArray(materials)) {
            for (const m of materials) {
                try {
                    if (m.id) await Material.findOneAndUpdate({ id: m.id }, m, { upsert: true });
                } catch (e) { errors.push(`Material ${m.id}: ${e.message}`); }
            }
        }
        // 3. Sync History (Active Date)
        if (history && history.date) {
            try {
                await History.findOneAndUpdate({ date: history.date }, history, { upsert: true });
            } catch (e) { errors.push(`History ${history.date}: ${e.message}`); }
        }
        // 4. Sync Global State (Balance, Pending, Notepad)
        if (globalState) {
            try {
                await GlobalState.findOneAndUpdate(
                    { key: 'main_state' },
                    { ...globalState, updatedAt: Date.now() },
                    { upsert: true }
                );
            } catch (e) { errors.push(`GlobalState: ${e.message}`); }
        }

        if (errors.length > 0) {
            console.warn('Sync partial errors:', errors);
            res.json({ success: true, warnings: errors });
        } else {
            res.json({ success: true });
        }
    } catch (err) {
        console.error('POST /sync-all error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
