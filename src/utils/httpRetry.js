const axios = require('axios');

async function fetchWithRetry(url, opts = {}, retries = 3, backoff = 1000) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios(Object.assign({ url }, opts));
            return response;
        } catch (err) {
            lastErr = err;
            // transient-ish errors: network, timeout
            const shouldRetry = attempt < retries && (!err.response || (err.code && ['ECONNRESET','ETIMEDOUT','ECONNABORTED'].includes(err.code)));
            if (!shouldRetry) break;
            await new Promise(r => setTimeout(r, backoff * attempt));
        }
    }
    throw lastErr;
}

module.exports = { fetchWithRetry };
