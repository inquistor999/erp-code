const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, './')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/calibri_erp';
mongoose.connect(MONGODB_URI).then(() => {
    console.log('Connected to MongoDB 🍃');
}).catch(err => {
    console.warn('MongoDB connection error (check your .env URI):', err.message);
    // Do not exit process, let server run so frontend can at least load
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
