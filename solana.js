const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint,
} = require("@solana/spl-token");

const bs58 = require("bs58");

const RPC_URL = process.env.RPC_URL;
const TOKEN_MINT = new PublicKey("BqC6Ldxw7vsFoiq4VxQwNwtxvrvaxF14qRkX6cfa2z5v");

const connection = new Connection(RPC_URL, "confirmed");

if (!process.env.AIRDROP_PRIVATE_KEY_BASE58) {
  throw new Error("NO PRIVATE KEY");
}

const airdropKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.AIRDROP_PRIVATE_KEY_BASE58)
);

module.exports = async function sendSKR(userWallet) {
  const userPubkey = new PublicKey(userWallet);

  // decimals берём с блокчейна
  const mintInfo = await getMint(connection, TOKEN_MINT);
  const decimals = mintInfo.decimals;
  const amount = 500n * 10n ** BigInt(decimals);

  // ATA аирдропа
  const fromAta = await getOrCreateAssociatedTokenAccount(
    connection,
    airdropKeypair,
    TOKEN_MINT,
    airdropKeypair.publicKey
  );

  // ATA пользователя
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection,
    airdropKeypair,
    TOKEN_MINT,
    userPubkey
  );

  if (BigInt(fromAta.amount.toString()) < amount) {
    throw new Error("NOT ENOUGH SKR");
  }

  const ix = createTransferInstruction(
    fromAta.address,
    toAta.address,
    airdropKeypair.publicKey,
    amount
  );

  const tx = new Transaction().add(ix);
  tx.feePayer = airdropKeypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const sig = await sendAndConfirmTransaction(connection, tx, [airdropKeypair]);
  return sig;
};
