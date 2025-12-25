// api/claim.js — ПРОСТОЙ И РАБОЧИЙ ВАРИАНТ

const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount,
  transfer,
} = require("@solana/spl-token");
const bs58 = require("bs58");

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_MINT = new PublicKey("BqC6Ldxw7vsFoiq4VxQwNwtxvrvaxF14qRkX6cfa2z5v");

const connection = new Connection(RPC_URL, "confirmed");

if (!process.env.AIRDROP_PRIVATE_KEY_BASE58) {
  throw new Error("AIRDROP_PRIVATE_KEY_BASE58 is not set");
}

const airdropKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.AIRDROP_PRIVATE_KEY_BASE58)
);

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const wallet =
  body?.wallet ||
  body?.publicKey ||
  body?.address ||
  req.query?.wallet ||
  req.query?.address ||
  req.headers["x-wallet"] ||
  req.headers["wallet"];

  if (!wallet) {
    return res.status(400).json({ error: "wallet required" });
  }

  let userPubkey;
  try {
    userPubkey = new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: "invalid wallet" });
  }

  try {
    const amount = 500_000_000; // 500 токенов при decimals=6

    const fromAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      airdropKeypair.publicKey
    );

    const toAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    const sig = await transfer(
      connection,
      airdropKeypair,
      fromAta.address,
      toAta.address,
      airdropKeypair.publicKey,
      amount
    );

    return res.json({ ok: true, signature: sig });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
