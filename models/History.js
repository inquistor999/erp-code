const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    date: { type: String, required: true }, // Format: DD-MM-YYYY
    production: [{
        id: Number,
        name: String,
        qty: Number,
        totalExp: Number,
        matCost: Number,
        laborCost: Number,
        materials: Array,
        workers: Array,
        time: String
    }],
    sales: [{
        name: String,
        qty: Number,
        price: Number,
        profit: Number,
        time: String
    }],
    paidWorkers: [String], // Array of task IDs (e.g., "prodId_workerIdx")
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('History', historySchema);
