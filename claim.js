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
} = require("@solana/spl-token");
const bs58 = require("bs58");

// === Config ===
const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");
const TOKEN_MINT = new PublicKey("Gf3XtY632if3F7yvnNdXQi8SnQTBsn8F7DQJFXru5Lh");
const DECIMALS = 6;
const AMOUNT_PER_CLAIM = 500n * 10n ** BigInt(DECIMALS); // 500 SKR

// === Solana connection ===
const connection = new Connection(RPC_URL, "confirmed");

// === Airdrop wallet from ENV (base58) ===
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
  throw e;
}

// In-memory anti-double-claim (на каждый инстанс функции)
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
  } catch (e) {
    res.status(400).json({ error: "invalid wallet address" });
    return;
  }

  const userKeyStr = userPubkey.toBase58();
  if (claimedWallets.has(userKeyStr)) {
    res.status(400).json({ error: "already claimed", alreadyClaimed: true });
    return;
  }

  try {
    // Airdrop wallet ATA
    const airdropAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      airdropKeypair.publicKey
    );

    if (airdropAta.amount < AMOUNT_PER_CLAIM) {
      res.status(400).json({ error: "Not enough SKR on airdrop wallet" });
      return;
    }

    // User ATA
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      userPubkey
    );

    const ix = createTransferInstruction(
      airdropAta.address,
      userAta.address,
      airdropKeypair.publicKey,
      AMOUNT_PER_CLAIM, // bigint
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
