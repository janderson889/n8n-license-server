const express = require('express');
const fs = require("fs");
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const PORT = 3000;

// --- Configuration ---
const privateKeyPath = 'private_key.pem';
const certificatePath = 'certificate.pem';

// Use PKCS1_PADDING to match NodeRSA's default
const rsaEncryptionPadding = crypto.constants.RSA_PKCS1_PADDING;
const signingHashAlgorithm = 'sha256';

const aesKeyLengthBytes = 32; // 32 bytes = 256 bits for AES-256

const outputEncoding = 'base64'; // Encoding for the output encrypted strings

// Load up certificates
if (!fs.existsSync(privateKeyPath)) {
    console.error(`Error: Private key file not found at "${privateKeyPath}".`);
    console.error('Please generate one using OpenSSL, e.g.:');
    console.error(`openssl genrsa -out ${privateKeyPath} 2048`);
    return;
}
if (!fs.existsSync(certificatePath)) {
    console.error(`Error: Certificate file not found at "${certificatePath}".`);
    console.error('Please generate a certificate (e.g., self-signed) using OpenSSL, e.g.:');
    console.error(`openssl req -new -x509 -key ${privateKeyPath} -out ${certificatePath} -days 42069 -subj "/CN=example.com/O=MyOrg"`);
    console.error('(The -subj "/CN=example.com" part avoids interactive prompts)');
    return;
}

let privateKeyPem;
let certificatePem;

try {
    privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
    certificatePem = fs.readFileSync(certificatePath, 'utf8');
} catch (error) {
    console.error('Failed to read key or certificate files:', error.message);
    return;
}

const app = express();
app.use(express.json());

app.all('/v1/renew', (req, res) => {
    console.log('Sending hardcoded license')
    const now = new Date();
    const expires = new Date();
    expires.setFullYear(now.getFullYear() + 20)

    const fakeLicense = {
        "consumerId": req.body.consumerId || '',
        "version": 2,
        "tenantId": 1,
        "renewalToken": req.body.renewalToken,
        "deviceLock": true,
        "deviceFingerprint": req.body.deviceFingerprint || '',
        "createdAt": now.toISOString(),
        "issuedAt": now.toISOString(),
        "expiresAt": expires.toISOString(),
        "terminatesAt": expires.toISOString(),
        "entitlements": [
            {
                "id": "d8576710-5504-454a-8a7c-eede1ed7acbb",
                "productId": "6418dc33-3523-4d3f-aede-6ea85ec5d59f",
                "productMetadata": {
                    "planName": "Enterprise $elf-hosted"
                },
                "features": {
                    "planName": "Enterprise $elf-hosted",
                    "feat:folders": true,
                    "feat:variables": true,
                    "feat:sharing": true,
                    "feat:logStreaming": true,
                    "feat:apiKeyScopes": true,
                    "feat:externalSecrets": true,
                    "feat:advancedPermissions": true,
                    "feat:debugInEditor": true,
                    "feat:workflowHistory": true,
                    "feat:workflowHistoryPrune": false,
                    "feat:projectRole:admin": true,
                    "feat:projectRole:editor": true,
                    "feat:projectRole:viewer": true,
                    "feat:advancedExecutionFilters": true,
                    "quota:insights:maxHistoryDays": 365,
                    "feat:insights:viewDashboard": true,
                    "feat:insights:viewHourlyData": true,
                    "feat:insights:viewSummary": true,
                    "quota:evaluations:maxWorkflows": 1,
                    "quota:maxTeamProjects": 50,
                    "quota:insights:retention:maxAgeDays": 180,
                    "quota:insights:retention:pruneIntervalDays": 24
                },
                "featureOverrides": {},
                "validFrom": now.toISOString(),
                "validTo": expires.toISOString(),
                "isFloatable": false
            }
        ],
        "detachedEntitlementsCount": 0,
        "managementJwt": "",
        "isEphemeral": false
    }
    const messageToEncrypt = JSON.stringify(fakeLicense)


    const aesKeyBuffer = crypto.randomBytes(aesKeyLengthBytes);

    let encryptedMessageCryptoJS;
    try {
        const encrypted = CryptoJS.AES.encrypt(
            messageToEncrypt,
            aesKeyBuffer.toString()
        );
        encryptedMessageCryptoJS = encrypted.toString();
    } catch (error) {
        console.error('Error during CryptoJS AES encryption:', error.message);
        return;
    }

    let encryptedAesKeyBuffer;
    try {
        encryptedAesKeyBuffer = crypto.privateEncrypt(
            { key: privateKeyPem, padding: rsaEncryptionPadding },
            aesKeyBuffer
        );
    } catch (error) {
        console.error('Error during RSA private key encryption of AES key:', error.message);
        return;
    }

    let signature;
    try {
        const signer = crypto.createSign(signingHashAlgorithm);
        signer.update(messageToEncrypt, 'utf8');
        signature = signer.sign(privateKeyPem, outputEncoding);
    } catch (error) {
        console.error('Error during digital signing:', error.message);
        return;
    }

    // Convert to license
    const licenseKey = `-----BEGIN LICENSE KEY-----\n${encryptedAesKeyBuffer.toString('base64')}||${encryptedMessageCryptoJS}||${signature}\n-----END LICENSE KEY-----`
    const licenseObj = {
        licenseKey,
        x509: certificatePem,
        "detachedEntitlementsCount": 0
    }
    res.json(licenseObj);
})

const server = app.listen(PORT, () => {
    console.log(`License server listening on http://localhost:${PORT}`);
});

// Graceful shutdown handler
const gracefulShutdown = () => {
    console.log('\nReceived SIGINT/SIGTERM. Starting graceful shutdown...');
    // Close the Express server first
    server.close((err) => {
        if (err) {
            console.error('Error closing server:', err);
            process.exit(1);
        }
        console.log('Express server closed.');
        console.log('Application gracefully shut down. Exiting.');
        process.exit(0);
    });

    // Force shutdown after a timeout if graceful shutdown takes too long
    setTimeout(() => {
        console.warn('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10_000);
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown); // Docker sends SIGTERM by default on `docker stop`
process.on('SIGINT', gracefulShutdown);  // Ctrl+C sends SIGINT
