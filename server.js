require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
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

// ====== КОНФИГ ======
const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");

// mint SKR
const TOKEN_MINT = new PublicKey(
  "Gf3XtY632if3F7yvnNdXQi8SnQTBsn8F7DQJFXru5Lh"
);

// 500 SKR, при decimals = 6 => 500 * 10^6
const DECIMALS = 6;
const AMOUNT_PER_CLAIM = BigInt(500) * 10n ** BigInt(DECIMALS);

// ===== base58 декодер для приватника =====
const ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP = {};
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP[ALPHABET[i]] = i;
}
function base58Decode(str) {
  if (!str || typeof str !== "string") {
    throw new Error("empty base58 string");
  }

  const bytes = [0];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = ALPHABET_MAP[char];
    if (value === undefined) {
      throw new Error("non-base58 char");
    }

    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff); // ← вот тут был косяк, было 0
      carry >>= 8;
    }
  }

  for (let k = 0; k < str.length && str[k] === "1"; k++) {
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

if (!process.env.AIRDROP_PRIVATE_KEY_BASE58) {
  console.error("В .env НЕТ AIRDROP_PRIVATE_KEY_BASE58");
  process.exit(1);
}

// приватный ключ кошелька, с которого шлём SKR
const secretKey = base58Decode(
  process.env.AIRDROP_PRIVATE_KEY_BASE58.trim()
);
const airdropKeypair = Keypair.fromSecretKey(secretKey);
const connection = new Connection(RPC_URL, "confirmed");

console.log("Airdrop wallet:", airdropKeypair.publicKey.toBase58());

const app = express();
app.use(cors());
app.use(express.json());

// раздаём фронт из папки public
app.use(express.static(path.join(__dirname, "public")));

// простая защита от повторных клеймов (память процесса)
const claimedWallets = new Set();

app.post("/api/claim", async (req, res) => {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: "wallet is required" });
    }

    let userPubkey;
    try {
      userPubkey = new PublicKey(wallet);
    } catch (e) {
      return res.status(400).json({ error: "invalid wallet address" });
    }

    const userKeyStr = userPubkey.toBase58();

    if (claimedWallets.has(userKeyStr)) {
      return res
        .status(400)
        .json({ error: "already claimed", alreadyClaimed: true });
    }

    // ATA аирдроп-кошелька
    const airdropAta = await getOrCreateAssociatedTokenAccount(
      connection,
      airdropKeypair,
      TOKEN_MINT,
      airdropKeypair.publicKey
    );

    if (airdropAta.amount < AMOUNT_PER_CLAIM) {
      return res
        .status(400)
        .json({ error: "Not enough SKR on airdrop wallet" });
    }

    // ATA пользователя
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
      Number(AMOUNT_PER_CLAIM),
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

    return res.json({ ok: true, signature: sig });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "internal error" });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SKR airdrop backend listening on http://localhost:${PORT}`);
});
