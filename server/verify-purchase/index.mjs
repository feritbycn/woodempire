// =============================================================
// Wood Empire — Google Play satın alma doğrulama sunucusu
// cordova-plugin-purchase (CdvPurchase v13) "validator" sözleşmesini uygular:
//   POST /verify  { id, transaction: { type: 'android-playstore', purchaseToken, receipt, signature } }
//   → { ok: true, data: { id, latest_receipt: true, transaction, collection: [...] } }
// Google Play Developer API (purchases.products.get) ile token'ın gerçekten ödendiği doğrulanır.
//
// GEREKENLER (docs/MONETIZATION.md):
//   GOOGLE_APPLICATION_CREDENTIALS = Play Console'a bağlı hizmet hesabı JSON dosyası
//   PACKAGE_NAME = com.woodempire.game
//   PORT = 8080
// NOT: Bu sunucu gerçek Play hesabı olmadan test EDİLEMEZ; yayından önce dahili test kanalında doğrulayın.
// =============================================================
import http from 'node:http';
import { GoogleAuth } from 'google-auth-library';

const PACKAGE = process.env.PACKAGE_NAME || 'com.woodempire.game';
const PORT = Number(process.env.PORT || 8080);
const KNOWN = new Set(['gold_small', 'gold_medium', 'gold_large', 'boost_pack', 'truck_pack', 'worker_pack', 'skin_pack', 'no_ads']);
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });

async function playProduct(productId, token) {
  const client = await auth.getClient();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const res = await client.request({ url });
  return res.data; // { purchaseState: 0=satın alındı, 1=iptal, 2=beklemede, consumptionState, acknowledgementState, orderId, purchaseTimeMillis }
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST' || !req.url.startsWith('/verify')) return send(res, 404, { ok: false, message: 'not found' });
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw);
      const tx = body.transaction || {};
      if (tx.type !== 'android-playstore') return send(res, 200, { ok: false, code: 6778003, message: 'Desteklenmeyen platform' });
      const receipt = typeof tx.receipt === 'string' ? JSON.parse(tx.receipt) : tx.receipt || {};
      const productId = receipt.productId || (receipt.productIds || [])[0] || body.id;
      const token = tx.purchaseToken || receipt.purchaseToken;
      if (!KNOWN.has(productId) || !token) return send(res, 200, { ok: false, code: 6778003, message: 'Geçersiz ürün' });
      if (receipt.packageName && receipt.packageName !== PACKAGE) return send(res, 200, { ok: false, code: 6778003, message: 'Paket uyuşmuyor' });
      const p = await playProduct(productId, token);
      if (p.purchaseState !== 0) return send(res, 200, { ok: false, code: 6778003, message: 'Ödeme tamamlanmamış', data: { purchaseState: p.purchaseState } });
      return send(res, 200, {
        ok: true,
        data: {
          id: productId,
          latest_receipt: true,
          transaction: tx,
          collection: [{ id: productId, purchaseDate: new Date(Number(p.purchaseTimeMillis)).toISOString(), isExpired: false, transactionId: p.orderId }],
        },
      });
    } catch (e) {
      console.error('[verify]', e?.response?.data || e);
      return send(res, 200, { ok: false, code: 6778006, message: 'Doğrulama hatası' });
    }
  });
});
server.listen(PORT, () => console.log(`Wood Empire doğrulama sunucusu :${PORT} (${PACKAGE})`));
