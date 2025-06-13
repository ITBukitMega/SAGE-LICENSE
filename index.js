require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const syncSessions = require('./sync');
const sql = require('mssql');
const { DateTime } = require('luxon');

// Set timezone untuk aplikasi
process.env.TZ = 'Asia/Jakarta';
console.log(`Server timezone set to: ${process.env.TZ}, current time: ${new Date().toLocaleString()}`);

const sqlConfig = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        // Jakarta Time
        useUTC: false,
    },
};

// Inisialisasi aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware untuk logging permintaan
app.use((req, res, next) => {
    console.log(`${new Date().toLocaleString('id-ID')} - ${req.method} ${req.url}`);
    next();
});

// Middleware untuk serving static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint untuk mengambil data session dari view listsession
app.get('/api/sessions', async (req, res) => {
    let pool;
    try {
        pool = await new sql.ConnectionPool(sqlConfig).connect();
        const result = await pool.query`
            SELECT Badge, License
            FROM listsessionnow
        `;
        
        const badgeTypes = ['ERPDEV', 'ERPDIS', 'ERPFIN', 'ERPFULL', 'ERPTRAN'];
        const sessionMap = {};
        
        result.recordset.forEach(record => {
            sessionMap[record.Badge] = record.License;
        });
        
        const responseData = badgeTypes.map(badge => ({
            Badge: badge,
            License: sessionMap[badge] || 0
        }));
        
        res.json(responseData);
    } catch (err) {
        console.error('Error fetching session data:', err.message);
        res.status(500).json({ error: 'Failed to fetch session data', message: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

// API endpoint untuk mengambil data history lisensi
app.get('/api/license-history', async (req, res) => {
    // Always default to 24 hours if not specified
    const hours = parseInt(req.query.hours) || 24;
    const badge = req.query.badge;
    
    let pool;
    try {
        pool = await new sql.ConnectionPool(sqlConfig).connect();
        const request = pool.request();
        
        request.input('hours', sql.Int, hours);
        
        // Log waktu sekarang menurut server
        const serverNow = new Date();
        console.log(`Server current time: ${serverNow.toLocaleString('id-ID')}`);
        
        let query = `
            SELECT badge, licenseCount, timestamp
            FROM LicenseHistory
            WHERE timestamp >= DATEADD(hour, -@hours, GETDATE())
            AND timestamp <= GETDATE()
        `;
        
        // Filter by badge jika parameter badge diberikan
        if (badge) {
            query += ' AND badge = @badge';
            request.input('badge', sql.VarChar(50), badge);
        }
        
        query += ' ORDER BY timestamp ASC';
        
        console.log('Executing SQL query:', query);
        const result = await request.query(query);
        
        // Log beberapa data untuk debugging
        if (result.recordset.length > 0) {
            const firstRecord = result.recordset[0];
            const lastRecord = result.recordset[result.recordset.length - 1];
            
            console.log(`Query returned ${result.recordset.length} records`);
            console.log(`First record timestamp (raw): ${firstRecord.timestamp}`);
            console.log(`First record timestamp (localized): ${new Date(firstRecord.timestamp).toLocaleString('id-ID')}`);
            console.log(`Last record timestamp (raw): ${lastRecord.timestamp}`);
            console.log(`Last record timestamp (localized): ${new Date(lastRecord.timestamp).toLocaleString('id-ID')}`);
        } else {
            console.log('Query returned no records');
        }
        
        // Konversi timestamp ke format yang benar untuk zona waktu Jakarta
        const formattedResults = result.recordset.map(record => {
            // Pastikan timestamp dalam format yang benar untuk WIB
            const timestamp = new Date(record.timestamp);
            
            return {
                badge: record.badge,
                licenseCount: record.licenseCount,
                timestamp: timestamp.toISOString(),
                // Tambahkan debug info
                timestampLocal: timestamp.toLocaleString('id-ID')
            };
        });
        
        res.json(formattedResults);
    } catch (err) {
        console.error('Error fetching license history:', err.message);
        res.status(500).json({ error: 'Failed to fetch license history', message: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

// Route dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server mulai bos
app.listen(PORT, () => {
    console.log(`🌐 Server dashboard berjalan di port ${PORT} pada waktu ${new Date().toLocaleString('id-ID')}`);
});

console.log('🚀 Sinkronisasi sesi login dimulai...');
syncSessions();

// sinkroninasi 1 jam bosku
cron.schedule('0 * * * *', () => { 
  console.log(`🔄 Sinkronisasi setiap 1 jam... (${new Date().toLocaleString('id-ID')})`);
  syncSessions();
});