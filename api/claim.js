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
// если есть RPC_URL в env – берём его, иначе стандартный mainnet-beta
const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");

// ВАЖНО: это MINT твоего токена SKR в mainnet
const TOKEN_MINT = new PublicKey("Gf3XtY632if3F7yvnNdXQi8SnQTBsn8F7DQJFXru5Lh");

// подключение к Solana
const connection = new Connection(RPC_URL, "confirmed");

// читаем приватный ключ кошелька раздачи из env
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

// один раз получаем decimals у mint
let decimalsPromise = null;
async function getDecimals() {
  if (!decimalsPromise) {
    decimalsPromise = getMint(connection, TOKEN_MINT).then((mint) => {
      console.log("ℹ️ SKR decimals:", mint.decimals);
      return mint.decimals;
    });
  }
  return decimalsPromise;
}

// можно вообще убрать антидубль, чтобы не мешал тестам
// если хочешь оставить – раскомментируй
// const claimedWallets = new Set();

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // ВАЖНО: Vercel сам парсит JSON-Body, если заголовок Content-Type: application/json
  const body = req.body || {};
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

  // если хочешь ограничить до одного клейма на инстанс – раскомментируй
  /*
  const userKeyStr = userPubkey.toBase58();
  if (claimedWallets.has(userKeyStr)) {
    res.status(400).json({ error: "already claimed", alreadyClaimed: true });
    return;
  }
  */

  try {
    // 1) берём decimals и считаем 500 SKR как обычное число
    const decimals = await getDecimals();
    const amountPerClaim = 500 * 10 ** decimals; // 500 SKR

    // 2) токен-аккаунт кошелька раздачи (создаст, если не было)
    const airdropAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      airdropKeypair.publicKey
    );

    // 3) токен-аккаунт пользователя
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    console.log("From ATA:", airdropAta.address.toBase58());
    console.log("To ATA:", userAta.address.toBase58());
    console.log("Amount per claim (raw):", amountPerClaim);

    // 4) перевод 500 SKR
    const ix = createTransferInstruction(
      airdropAta.address,           // откуда
      userAta.address,              // куда
      airdropKeypair.publicKey,     // владелец
      amountPerClaim,               // сколько (number)
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

    // claimedWallets.add(userKeyStr);

    res.status(200).json({ ok: true, signature: sig });
  } catch (e) {
    console.error("❌ claim error", e);
    // ВОТ ЭТО сообщение и улетает на фронт как data.error
    res.status(500).json({
      error: e.message || "failed to claim airdrop",
    });
  }
};
