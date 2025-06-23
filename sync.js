require('dotenv').config();
const { MongoClient } = require('mongodb');
const sql = require('mssql');

const mongoUri = process.env.MONGO_URI;

const sqlConfig = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        // Optimisasi timeout
        requestTimeout: 60000,
        connectionTimeout: 30000,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

async function syncSessions() {
    let mongoClient;
    let pool;

    try {
        const now = new Date();
        const jakartaPlus7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);

        console.log(`🔄 Starting sync at ${jakartaPlus7.toLocaleString('id-ID')}`);

        // 1. Koneksi ke MongoDB
        mongoClient = await MongoClient.connect(mongoUri);
        const db = mongoClient.db();
        const collection = db.collection('SessionState');

        const allSessions = await collection.find().toArray();

        // 2. Filter No Admin
        const sessions = allSessions.filter((doc, index) => doc.userName !== 'admin' || index >= 2);

        console.log(`📦 Ditemukan ${sessions.length} session (tanpa 2 admin)`);

        // 3. Koneksi ke SQL Server
        pool = await sql.connect(sqlConfig);

        // 5. Batch insert untuk UserSessions (lebih efisien)
        if (sessions.length > 0) {
            console.log('💾 Inserting UserSessions in batch...');
            
            const batchSize = 100;
            for (let i = 0; i < sessions.length; i += batchSize) {
                const batch = sessions.slice(i, i + batchSize);
                await insertUserSessionsBatch(pool, batch, jakartaPlus7);
            }
        }

        console.log('✅ UserSessions sinkronisasi berhasil.');

        // 6. Hitung jumlah lisensi per badge
        const badgeCounts = {
            ERPDEV: 0,
            ERPDIS: 0,
            ERPFIN: 0,
            ERPFULL: 0,
            ERPTRAN: 0
        };

        // Hitung jumlah per badge
        for (const session of sessions) {
            const { badge } = session;
            if (badgeCounts.hasOwnProperty(badge)) {
                badgeCounts[badge]++;
            }
        }

        console.log('📊 License counts:', badgeCounts);

        // 7. Simpan ke tabel history dalam satu transaksi
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const badge in badgeCounts) {
                await transaction.request()
                    .input('badge', sql.VarChar(50), badge)
                    .input('licenseCount', sql.Int, badgeCounts[badge])
                    .input('timestamp', sql.DateTime, jakartaPlus7)
                    .query(`
                        INSERT INTO LicenseHistory (badge, licenseCount, timestamp)
                        VALUES (@badge, @licenseCount, @timestamp)
                    `);
            }
            
            await transaction.commit();
            console.log('📊 Data historis lisensi berhasil disimpan.');
            
        } catch (transactionError) {
            await transaction.rollback();
            throw transactionError;
        }

        console.log(`✅ Sync completed successfully at ${new Date().toLocaleString('id-ID')}`);

    } catch (err) {
        console.error('❌ Error sinkronisasi:', err.message);
        console.error('Stack trace:', err.stack);
    } finally {
        // Cleanup connections
        if (mongoClient) {
            try {
                await mongoClient.close();
            } catch (closeErr) {
                console.error('Error closing MongoDB:', closeErr.message);
            }
        }
        
        if (pool) {
            try {
                await pool.close();
            } catch (closeErr) {
                console.error('Error closing SQL pool:', closeErr.message);
            }
        }
    }
}

// Helper function untuk batch insert UserSessions
async function insertUserSessionsBatch(pool, sessions, syncTime) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        for (const session of sessions) {
            const {
                publicId,
                userName,
                clientId,
                host,
                dataset,
                badge,
                serverName,
                peerAddress,
                serverFolder,
                sessionType,
                lastAccessUTC,
                expiredAtUTC,
                status,
            } = session;

            await transaction.request()
                .input('publicId', sql.UniqueIdentifier, publicId)
                .input('userName', sql.VarChar(100), userName)
                .input('clientId', sql.UniqueIdentifier, clientId)
                .input('host', sql.VarChar(100), host)
                .input('peerAddress', sql.VarChar(50), peerAddress)
                .input('dataset', sql.VarChar(100), dataset)
                .input('badge', sql.VarChar(50), badge)
                .input('serverName', sql.VarChar(100), serverName)
                .input('serverFolder', sql.VarChar(50), serverFolder)
                .input('sessionType', sql.VarChar(50), sessionType)
                .input('lastAccessUTC', sql.DateTime, new Date(lastAccessUTC))
                .input('expiredAtUTC', sql.DateTime, new Date(expiredAtUTC))
                .input('status', sql.Int, status)
                .input('syncTime', sql.DateTime, syncTime)
                .query(`
                    INSERT INTO UserSessions (
                        publicId, userName, clientId, host, dataset, badge, peerAddress, serverName,
                        serverFolder, sessionType, lastAccessUTC, expiredAtUTC, status, syncTime
                    )
                    VALUES (
                        @publicId, @userName, @clientId, @host, @dataset, @badge, @peerAddress, @serverName,
                        @serverFolder, @sessionType, @lastAccessUTC, @expiredAtUTC, @status, @syncTime
                    )
                `);
        }

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

module.exports = syncSessions;