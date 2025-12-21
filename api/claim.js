// api/claim.js
const {
  Connection,
  clusterApiUrl,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getMint,
} = require("@solana/spl-token");
const bs58 = require("bs58");

// === CONFIG ===
const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");
const TOKEN_MINT = new PublicKey("Gf3XtY632if3F7yvnNdXQi8SnQTBsn8F7DQJFXru5Lh");

// подключение к Solana
const connection = new Connection(RPC_URL, "confirmed");

// читаем приватный ключ из ENV
if (!process.env.AIRDROP_PRIVATE_KEY_BASE58) {
  console.error("❌ No AIRDROP_PRIVATE_KEY_BASE58 in environment");
  throw new Error("AIRDROP_PRIVATE_KEY_BASE58 is not set");
}

let airdropKeypair;
try {
  const secretKey = bs58.decode(process.env.AIRDROP_PRIVATE_KEY_BASE58.trim());
  airdropKeypair = Keypair.fromSecretKey(secretKey);
  console.log("🟢 Airdrop wallet:", airdropKeypair.publicKey.toBase58());
} catch (e) {
  console.error("❌ Failed to init airdrop keypair:", e);
  throw new Error("Failed to init airdrop keypair: " + (e.message || "unknown"));
}

// кешируем decimals, чтобы не дёргать сеть каждый раз
let mintDecimalsPromise = null;
async function getMintDecimals() {
  if (!mintDecimalsPromise) {
    mintDecimalsPromise = getMint(connection, TOKEN_MINT).then((mint) => {
      console.log("ℹ️ SKR decimals:", mint.decimals);
      return mint.decimals;
    });
  }
  return mintDecimalsPromise;
}

// защита от повторного claim на один инстанс
const claimedWallets = new Set();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (!body || typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }

  const wallet = body.wallet;
  if (!wallet) {
    res.status(400).json({ error: "wallet is required" });
    return;
  }

  let userPubkey;
  try {
    userPubkey = new PublicKey(wallet);
  } catch {
    res.status(400).json({ error: "invalid wallet address" });
    return;
  }

  const userKeyStr = userPubkey.toBase58();
  if (claimedWallets.has(userKeyStr)) {
    res.status(400).json({ error: "already claimed", alreadyClaimed: true });
    return;
  }

  try {
    // 1) узнаём decimals у твоего токена
    const decimals = await getMintDecimals();
    const amountPerClaim = 500n * 10n ** BigInt(decimals); // 500 SKR

    // 2) находим ATA кошелька раздачи
    const airdropAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      airdropKeypair.publicKey
    );

    if (airdropAta.amount < amountPerClaim) {
      console.log(
        "❌ Not enough SKR. Have:",
        airdropAta.amount.toString(),
        "need:",
        amountPerClaim.toString()
      );
      res.status(400).json({ error: "Not enough SKR on airdrop wallet" });
      return;
    }

    // 3) ATA пользователя
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    // 4) перевод
    const ix = createTransferInstruction(
      airdropAta.address,
      userAta.address,
      airdropKeypair.publicKey,
      amountPerClaim,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    tx.feePayer = airdropKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const sig = await sendAndConfirmTransaction(connection, tx, [
      airdropKeypair,
    ]);

    claimedWallets.add(userKeyStr);

    res.status(200).json({ ok: true, signature: sig });
  } catch (e) {
    console.error("❌ claim error", e);
    res.status(500).json({ error: e.message || "internal error" });
  }
};
