const mongoose = require('mongoose');

const globalStateSchema = new mongoose.Schema({
    key: { type: String, default: 'main_state' },
    totalBalance: { type: Number, default: 0 },
    pendingWork: [{
        id: Number,
        workerName: String,
        itemName: String,
        qty: Number,
        status: { type: String, default: 'waiting' },
        time: String
    }],
    notepad: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GlobalState', globalStateSchema);
