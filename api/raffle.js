// api/raffle.js
import nacl from "tweetnacl";
import bs58 from "bs58";

const registered = new Set();
const challenges = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet, signature, action } = req.body || {};

  if (!wallet) {
    return res.status(400).json({ error: "wallet is required" });
  }

  // 1️⃣ Запрос текста для подписи
  if (action === "challenge") {
    const message = `Raffle entry confirmation\nWallet: ${wallet}\nNonce: ${Date.now()}`;
    challenges.set(wallet, message);

    return res.status(200).json({
      message
    });
  }

  // 2️⃣ Проверка подписи
  if (!signature) {
    return res.status(400).json({ error: "signature is required" });
  }

  if (registered.has(wallet)) {
    return res.status(400).json({
      error: "already registered",
      alreadyRegistered: true
    });
  }

  const message = challenges.get(wallet);
  if (!message) {
    return res.status(400).json({ error: "challenge not found" });
  }

  const isValid = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    bs58.decode(signature),
    bs58.decode(wallet)
  );

  if (!isValid) {
    return res.status(401).json({ error: "invalid signature" });
  }

  challenges.delete(wallet);
  registered.add(wallet);

  return res.status(200).json({ ok: true });
}
