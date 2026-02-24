const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Material = require('../models/Material');
const History = require('../models/History');

// --- Products (Sklad) ---
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/products', async (req, res) => {
    const product = new Product(req.body);
    try {
        const newProduct = await product.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ message: err.message });
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

router.post('/materials', async (req, res) => {
    const material = new Material(req.body);
    try {
        const newMaterial = await material.save();
        res.status(201).json(newMaterial);
    } catch (err) {
        res.status(400).json({ message: err.message });
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

router.post('/history', async (req, res) => {
    const { date, production, sales, paidWorkers } = req.body;
    try {
        let history = await History.findOne({ date });
        if (history) {
            if (production) history.production = [...history.production, ...production];
            if (sales) history.sales = [...history.sales, ...sales];
            if (paidWorkers) history.paidWorkers = [...history.paidWorkers, ...paidWorkers];
            await history.save();
        } else {
            history = new History(req.body);
            await history.save();
        }
        res.status(201).json(history);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Bulk Sync (For elite performance - 0.5s sync) ---
router.post('/sync-all', async (req, res) => {
    const { products, materials, history } = req.body;
    try {
        // This is a heavy operation but ensures absolute consistency
        if (products) {
            for (const p of products) {
                await Product.findOneAndUpdate({ id: p.id }, p, { upsert: true });
            }
        }
        if (materials) {
            for (const m of materials) {
                await Material.findOneAndUpdate({ id: m.id }, m, { upsert: true });
            }
        }
        if (history && history.date) {
            await History.findOneAndUpdate({ date: history.date }, history, { upsert: true });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
