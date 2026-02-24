const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    stock: { type: Number, default: 0 },
    unit: { type: String, default: 'm' },
    costPerUnit: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Material', materialSchema);
