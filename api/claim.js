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
// МИНТ ТВОЕГО SKR
const TOKEN_MINT = new PublicKey("Gf3XtY632if3F7yvnNdXQi8SnQTBsn8F7DQJFXru5Lh");

// подключение к Solana
const connection = new Connection(RPC_URL, "confirmed");

// читаем приватный ключ из ENV
if (!process.env.AIRDROP_PRIVATE_KEY_BASE58) {
  console.error("❌ No AIRDROP_PRIVATE_KEY_BASE58 in environment");
  throw new Error("AIRDROP_PRIVATE_KEY_BASE58 is not set");
}

let airdropKeypair;
let AIRDROP_PUBKEY_STR = "";
try {
  const secretKey = bs58.decode(process.env.AIRDROP_PRIVATE_KEY_BASE58.trim());
  airdropKeypair = Keypair.fromSecretKey(secretKey);
  AIRDROP_PUBKEY_STR = airdropKeypair.publicKey.toBase58();
  console.log("🟢 Airdrop wallet:", AIRDROP_PUBKEY_STR);
} catch (e) {
  console.error("❌ Failed to init airdrop keypair:", e);
  throw new Error("Failed to init airdrop keypair: " + (e.message || "unknown"));
}

// кешируем decimals, чтобы не дёргать сеть каждый раз
let mintInfoPromise = null;
async function getMintInfo() {
  if (!mintInfoPromise) {
    mintInfoPromise = getMint(connection, TOKEN_MINT)
      .then((mint) => {
        console.log("ℹ️ SKR decimals:", mint.decimals);
        return mint;
      })
      .catch((e) => {
        console.error("❌ Failed to fetch mint info:", e);
        throw new Error("Failed to fetch mint info: " + (e.message || "unknown"));
      });
  }
  return mintInfoPromise;
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
    const mintInfo = await getMintInfo();
    const decimals = mintInfo.decimals;
    const amountPerClaim = 500n * 10n ** BigInt(decimals); // 500 SKR

    // 1) ATA кошелька раздачи
    const airdropAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      airdropKeypair.publicKey
    );

    // DEBUG в логах Vercel
    console.log("Airdrop ATA:", airdropAta.address.toBase58());
    console.log("Airdrop balance (raw):", airdropAta.amount.toString());
    console.log("Need for claim (raw):", amountPerClaim.toString());
    console.log("Decimals:", decimals);

    if (airdropAta.amount < amountPerClaim) {
      // ВАЖНО: здесь мы тебе отдаём максимум инфы, чтобы ты видел, что реально на кошельке
      res.status(400).json({
        error: "Not enough SKR on airdrop wallet",
        airdropWallet: AIRDROP_PUBKEY_STR,
        decimals,
        haveRaw: airdropAta.amount.toString(),
        needRaw: amountPerClaim.toString(),
      });
      return;
    }

    // 2) ATA пользователя
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    // 3) перевод
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
