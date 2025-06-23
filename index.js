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
        // Tambahan untuk optimisasi
        requestTimeout: 30000,
        connectionTimeout: 30000,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
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

// OPTIMIZED API endpoint untuk mengambil data session dari view listsession
app.get('/api/sessions', async (req, res) => {
    let pool;
    try {
        console.log('API /api/sessions called');
        pool = await new sql.ConnectionPool(sqlConfig).connect();
        
        // Query yang lebih sederhana dan cepat
        const result = await pool.query`
            SELECT Badge, License
            FROM listsessionnow
            WHERE Badge IN ('ERPDEV', 'ERPDIS', 'ERPFIN', 'ERPFULL', 'ERPTRAN')
        `;
        
        console.log(`Query returned ${result.recordset.length} records`);
        
        const badgeTypes = ['ERPDEV', 'ERPDIS', 'ERPFIN', 'ERPFULL', 'ERPTRAN'];
        const sessionMap = {};
        
        // Buat map dari hasil query
        result.recordset.forEach(record => {
            sessionMap[record.Badge] = record.License || 0;
        });
        
        // Pastikan semua badge ada dengan nilai default 0
        const responseData = badgeTypes.map(badge => ({
            Badge: badge,
            License: sessionMap[badge] || 0
        }));
        
        console.log('Response data:', responseData);
        res.json(responseData);
        
    } catch (err) {
        console.error('Error fetching session data:', err.message);
        console.error('Stack trace:', err.stack);
        
        // Return default data jika ada error
        const defaultData = [
            { Badge: 'ERPDEV', License: 0 },
            { Badge: 'ERPDIS', License: 0 },
            { Badge: 'ERPFIN', License: 0 },
            { Badge: 'ERPFULL', License: 0 },
            { Badge: 'ERPTRAN', License: 0 }
        ];
        
        res.status(200).json(defaultData); // Return 200 dengan default data
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeErr) {
                console.error('Error closing pool:', closeErr.message);
            }
        }
    }
});

// OPTIMIZED API endpoint untuk mengambil data history lisensi
app.get('/api/license-history', async (req, res) => {
    const hours = parseInt(req.query.hours) || 24;
    const badge = req.query.badge;
    
    let pool;
    try {
        console.log(`API /api/license-history called for ${hours} hours`);
        pool = await new sql.ConnectionPool(sqlConfig).connect();
        const request = pool.request();
        
        request.input('hours', sql.Int, hours);
        
        // Query yang dioptimasi dengan LIMIT dan ORDER BY yang efisien
        let query = `
            SELECT TOP 1000 badge, licenseCount, timestamp
            FROM LicenseHistory
            WHERE timestamp >= DATEADD(hour, -@hours, GETDATE())
            AND timestamp <= GETDATE()
        `;
        
        // Filter by badge jika parameter badge diberikan
        if (badge) {
            query += ' AND badge = @badge';
            request.input('badge', sql.VarChar(50), badge);
        }
        
        query += ' ORDER BY timestamp DESC'; // DESC untuk data terbaru dulu
        
        console.log('Executing optimized query...');
        const result = await request.query(query);
        
        console.log(`Query returned ${result.recordset.length} records`);
        
        // Reverse array untuk chronological order (oldest first)
        const sortedResults = result.recordset.reverse();
        
        // Format hasil dengan optimisasi
        const formattedResults = sortedResults.map(record => {
            const timestamp = new Date(record.timestamp);
            
            return {
                badge: record.badge,
                licenseCount: record.licenseCount,
                timestamp: timestamp.toISOString()
            };
        });
        
        res.json(formattedResults);
        
    } catch (err) {
        console.error('Error fetching license history:', err.message);
        console.error('Stack trace:', err.stack);
        
        // Return empty array jika ada error
        res.status(200).json([]);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeErr) {
                console.error('Error closing pool:', closeErr.message);
            }
        }
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        timezone: process.env.TZ 
    });
});

// Route dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
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