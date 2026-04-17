const crypto = require('crypto');

const PAYU_KEY = process.env.PAYU_MERCHANT_KEY;
const PAYU_SALT = process.env.PAYU_SALT;
const PAYU_MODE = (process.env.PAYU_MODE || 'TEST').toUpperCase();

/** TEST / sandbox vs LIVE — matches demo/mahabaleshwar-escapes backend; also accepts PRODUCTION / LIVE (any case). */
const PAYU_ENDPOINT =
    PAYU_MODE === 'LIVE' || PAYU_MODE === 'PRODUCTION'
        ? 'https://secure.payu.in/_payment'
        : 'https://test.payu.in/_payment';

/** Stops CDNs/browsers from caching PayU bridge HTML. */
function setPayuBridgeHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

/** PayU expects amount as a decimal string with two places (e.g. "10.00"). */
const formatAmountForPayU = (amount) => {
    const n = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''));
    if (Number.isNaN(n)) return '0.00';
    return n.toFixed(2);
};

/**
 * Forward hash for hosted checkout — sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
const generatePaymentRequestHash = (params) => {
    const key = params.key;
    const txnid = params.txnid;
    const amount = String(params.amount);
    const productinfo = params.productinfo;
    const firstname = params.firstname;
    const email = params.email;
    const udf1 = params.udf1 ?? '';
    const udf2 = params.udf2 ?? '';
    const udf3 = params.udf3 ?? '';
    const udf4 = params.udf4 ?? '';
    const udf5 = params.udf5 ?? '';
    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${PAYU_SALT}`;
    return crypto.createHash('sha512').update(hashString, 'utf8').digest('hex').toLowerCase();
};

/**
 * PayU reverse hash (success/failure POST). Supports additional_charges when present.
 */
const verifyPayUReverseHash = (params) => {
    if (!PAYU_SALT) return false;
    const received = String(params.hash || params.hashes?.sha512 || '').toLowerCase();
    if (!received) return false;
    const salt = PAYU_SALT;
    const status = params.status ?? '';
    const udf5 = params.udf5 ?? '';
    const udf4 = params.udf4 ?? '';
    const udf3 = params.udf3 ?? '';
    const udf2 = params.udf2 ?? '';
    const udf1 = params.udf1 ?? '';
    const email = params.email ?? '';
    const firstname = params.firstname ?? '';
    const productinfo = params.productinfo ?? '';
    const amount = params.amount != null ? String(params.amount) : '';
    const txnid = params.txnid ?? '';
    const key = params.key ?? '';
    const additionalCharges = params.additionalCharges ?? params.additional_charges ?? '';
    let hashString;
    if (additionalCharges) {
        hashString = `${additionalCharges}|${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
    } else {
        hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
    }
    const calculated = crypto.createHash('sha512').update(hashString, 'utf8').digest('hex').toLowerCase();
    return calculated === received;
};

const createPaymentParams = ({ txnId, amount, productInfo, firstName, email, phone, udf1, udf2, surl, furl }) => {
    const amountStr = formatAmountForPayU(amount);
    const params = {
        key: PAYU_KEY,
        txnid: txnId,
        amount: amountStr,
        productinfo: productInfo,
        firstname: firstName,
        email,
        phone: phone || '9999999999',
        surl,
        furl,
        udf1: udf1 || '',
        udf2: udf2 || '',
        udf3: '',
        udf4: '',
        udf5: '',
    };
    params.hash = generatePaymentRequestHash(params);
    return params;
};

/** Same pattern as demo: minimal HTML, immediate form submit to PayU (no service_provider). */
const getPaymentFormHtml = (params) => {
    const fields = Object.entries(params)
        .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}" />`)
        .join('\n');
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Redirecting to PayU...</title></head>
<body>
<p>Redirecting to payment gateway...</p>
<form id="payuForm" method="post" action="${PAYU_ENDPOINT}">
${fields}
</form>
<script>
    if (!window.payuSubmitted) {
        window.payuSubmitted = true;
        document.getElementById('payuForm').submit();
    }
</script>
</body>
</html>`;
};

const isPayUConfigured = () => !!(PAYU_KEY && PAYU_SALT);

module.exports = {
    createPaymentParams,
    getPaymentFormHtml,
    isPayUConfigured,
    setPayuBridgeHeaders,
    verifyPayUReverseHash,
    PAYU_ENDPOINT,
    formatAmountForPayU,
};
