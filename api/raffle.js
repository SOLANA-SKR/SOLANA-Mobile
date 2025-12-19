// api/raffle.js

let registered = new Set();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const wallet = body && body.wallet;
  if (!wallet) {
    res.status(400).json({ error: "wallet is required" });
    return;
  }

  if (registered.has(wallet)) {
    res.status(400).json({ error: "already registered", alreadyRegistered: true });
    return;
  }

  registered.add(wallet);

  res.status(200).json({ ok: true });
};
