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
    },
};

async function syncSessions() {
    let mongoClient;

    try {
        const now = new Date();
        const jakartaPlus7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);

        // 1. Koneksi ke MongoDB
        mongoClient = await MongoClient.connect(mongoUri);
        const db = mongoClient.db();
        const collection = db.collection('SessionState');

        const allSessions = await collection.find().toArray();

        // 2. Filter No Admin
        const sessions = allSessions.filter((doc, index) => doc.userName !== 'admin' || index >= 2);

        console.log(`📦 Ditemukan ${sessions.length} session (tanpa 2 admin)`);

        // 3. Koneksi ke SQL Server
        const pool = await sql.connect(sqlConfig);

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

            await pool.request()
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
                .input('syncTime', sql.DateTime, jakartaPlus7)
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

        console.log('✅ Sinkronisasi berhasil disimpan ke SQL Server.');

        // Hitung jumlah lisensi per badge
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

        // Simpan ke tabel history
        for (const badge in badgeCounts) {
            await pool.request()
                .input('badge', sql.VarChar(50), badge)
                .input('licenseCount', sql.Int, badgeCounts[badge])
                .input('timestamp', sql.DateTime, jakartaPlus7)
                .query(`
                    INSERT INTO LicenseHistory (badge, licenseCount, timestamp)
                    VALUES (@badge, @licenseCount, @timestamp)
                `);
        }

        console.log('📊 Data historis lisensi berhasil disimpan.');
    } catch (err) {
        console.error('❌ Error sinkronisasi:', err.message);
    } finally {
        if (mongoClient) await mongoClient.close();
        await sql.close();
    }
}

module.exports = syncSessions;