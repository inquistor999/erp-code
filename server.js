const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, './')));

// MongoDB Connection with Auto-Reconnect
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/calibri_erp';

function connectDB() {
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    }).then(() => {
        console.log('Connected to MongoDB 🍃');
    }).catch(err => {
        console.warn('MongoDB connection error:', err.message);
        // Retry connection after 5 seconds
        setTimeout(connectDB, 5000);
    });
}

connectDB();

// Auto-Reconnect on disconnect
mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Reconnecting in 5s...');
    setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err.message);
});

// Health Check Endpoint (for Render monitoring)
app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    res.json({
        server: 'ok',
        database: dbState === 1 ? 'connected' : 'disconnected',
        dbState: dbState,
        timestamp: new Date().toISOString()
    });
});

// Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Main route serves index.html for all non-API paths (Express 5 compatible)
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} 🚀`);
});
