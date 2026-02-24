const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Material = require('../models/Material');
const History = require('../models/History');
const GlobalState = require('../models/GlobalState');

// --- Global State (Balance, Pending, Notepad) ---
router.get('/global-state', async (req, res) => {
    try {
        let state = await GlobalState.findOne({ key: 'main_state' });
        if (!state) {
            state = await GlobalState.create({ key: 'main_state' });
        }
        res.json(state);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Products (Sklad) ---
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Materials ---
router.get('/materials', async (req, res) => {
    try {
        const materials = await Material.find();
        res.json(materials);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- History ---
router.get('/history', async (req, res) => {
    try {
        const history = await History.find();
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Bulk Sync (Optimized for Collaboration) ---
router.post('/sync-all', async (req, res) => {
    const { products, materials, history, globalState } = req.body;
    try {
        // 1. Sync Products
        if (products && Array.isArray(products)) {
            for (const p of products) {
                if (p.id) await Product.findOneAndUpdate({ id: p.id }, p, { upsert: true });
            }
        }
        // 2. Sync Materials
        if (materials && Array.isArray(materials)) {
            for (const m of materials) {
                if (m.id) await Material.findOneAndUpdate({ id: m.id }, m, { upsert: true });
            }
        }
        // 3. Sync History (Active Date)
        if (history && history.date) {
            await History.findOneAndUpdate({ date: history.date }, history, { upsert: true });
        }
        // 4. Sync Global State (Balance, Pending, Notepad)
        if (globalState) {
            await GlobalState.findOneAndUpdate(
                { key: 'main_state' },
                { ...globalState, updatedAt: Date.now() },
                { upsert: true }
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
