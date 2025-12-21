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
// МИНТ твоего токена SKR (mainnet)
const TOKEN_MINT = new PublicKey("BqC6Ldxw7vsFoiq4VxQwNwtxvrvaxF14qRkX6cfa2z5v");

// подключение к Solana
const connection = new Connection(RPC_URL, "confirmed");

// читаем приватный ключ кошелька раздачи из env
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

// --- mint info (decimals) ---
let mintInfoPromise = null;
async function getMintInfo() {
  if (!mintInfoPromise) {
    mintInfoPromise = getMint(connection, TOKEN_MINT);
  }
  return mintInfoPromise;
}

// --- ищем токен-аккаунт с максимальным балансом SKR ---
async function getSourceTokenAccount() {
  const owner = airdropKeypair.publicKey;

  const resp = await connection.getParsedTokenAccountsByOwner(
    owner,
    { mint: TOKEN_MINT },
    "confirmed"
  );

  // если вдруг нет parsed-аккаунтов, пробуем через стандартный ATA
  if (!resp.value || resp.value.length === 0) {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      owner
    );
    return {
      pubkey: ata.address,
      amount: BigInt(ata.amount.toString()),
    };
  }

  let bestPubkey = resp.value[0].pubkey;
  let bestAmount = BigInt(
    resp.value[0].account.data.parsed.info.tokenAmount.amount
  );

  for (const item of resp.value.slice(1)) {
    const amount = BigInt(item.account.data.parsed.info.tokenAmount.amount);
    if (amount > bestAmount) {
      bestAmount = amount;
      bestPubkey = item.pubkey;
    }
  }

  console.log(
    "🏦 source token account:",
    bestPubkey.toBase58(),
    "balance (raw):",
    bestAmount.toString()
  );

  return { pubkey: bestPubkey, amount: bestAmount };
}

// защита от повторного клейма на один инстанс
const claimedWallets = new Set();

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // аккуратно парсим body (на Vercel может быть строка)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") {
    body = {};
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

    // 1) токен-аккаунт с реальными SKR
    const source = await getSourceTokenAccount();

    // 2) ATA пользователя
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    console.log("To ATA:", userAta.address.toBase58());
    console.log("Amount per claim (raw):", amountPerClaim.toString());

    // 3) перевод 500 SKR
    const ix = createTransferInstruction(
      source.pubkey,
      userAta.address,
      airdropKeypair.publicKey,
      amountPerClaim,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    tx.feePayer = airdropKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;

    const sig = await sendAndConfirmTransaction(connection, tx, [
      airdropKeypair,
    ]);

    claimedWallets.add(userKeyStr);

    res.status(200).json({ ok: true, signature: sig });
  } catch (e) {
    console.error("❌ claim error", e);
    res.status(500).json({
      error: e.message || "failed to claim airdrop",
    });
  }
};
