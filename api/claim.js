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
// ТВОЙ mint SKR
const TOKEN_MINT = new PublicKey("Gf3XtY632if3F7yvnNdXQi8SnQTBsn8F7DQJFXru5Lh");

// подключение к Solana mainnet-beta (или что ты указал в RPC_URL)
const connection = new Connection(RPC_URL, "confirmed");

// читаем приватный ключ кошелька раздачи
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

// кешируем информацию о mint (decimals)
let mintInfoPromise = null;
async function getMintInfo() {
  if (!mintInfoPromise) {
    mintInfoPromise = getMint(connection, TOKEN_MINT).then((mint) => {
      console.log("ℹ️ SKR decimals:", mint.decimals);
      return mint;
    });
  }
  return mintInfoPromise;
}

// ищем токен-аккаунт с максимумом SKR у кошелька раздачи
async function getRichestSourceTokenAccount() {
  const owner = airdropKeypair.publicKey;

  const resp = await connection.getParsedTokenAccountsByOwner(
    owner,
    { mint: TOKEN_MINT },
    "confirmed"
  );

  if (!resp.value || resp.value.length === 0) {
    throw new Error("No token accounts for this mint on airdrop wallet");
  }

  let best = null;

  for (const item of resp.value) {
    const pubkey = item.pubkey;
    const info = item.account.data.parsed.info;
    const amountStr = info.tokenAmount.amount; // строка
    const amount = BigInt(amountStr);

    if (!best || amount > best.amount) {
      best = { pubkey, amount };
    }
  }

  console.log(
    "🏦 Source token account:",
    best.pubkey.toBase58(),
    "balance (raw):",
    best.amount.toString()
  );

  return best;
}

// защита от повторного claim на один инстанс функции
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
    // 1) mint info → decimals → 500 SKR
    const mintInfo = await getMintInfo();
    const decimals = mintInfo.decimals;
    const amountPerClaim = 500n * 10n ** BigInt(decimals); // 500 SKR

    // 2) ищем токен-аккаунт с максимальным балансом SKR
    const source = await getRichestSourceTokenAccount();

    if (source.amount < amountPerClaim) {
      return res.status(400).json({
        error: "Not enough SKR on airdrop wallet",
        airdropWallet: airdropKeypair.publicKey.toBase58(),
        haveRaw: source.amount.toString(),
        needRaw: amountPerClaim.toString(),
        decimals,
      });
    }

    // 3) ATA пользователя (создаём, если нет)
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    // 4) перевод 500 SKR
    const ix = createTransferInstruction(
      source.pubkey,                 // откуда
      userAta.address,               // куда
      airdropKeypair.publicKey,      // владелец
      amountPerClaim,                // сколько
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
