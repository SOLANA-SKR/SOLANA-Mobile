let walletAddress = null;

// 1. Подключение Phantom
async function connectWallet() {
  if (!window.solana || !window.solana.isPhantom) {
    alert("Установи Phantom");
    return;
  }

  const resp = await window.solana.connect();
  walletAddress = resp.publicKey.toString();

  document.getElementById("status").innerText =
    "Подключён: " + walletAddress;

  document.getElementById("claimBtn").disabled = false;
}

// 2. Claim airdrop
async function claim() {
  if (!walletAddress) {
    alert("Сначала подключи кошелёк");
    return;
  }

  document.getElementById("status").innerText = "Отправляем транзакцию...";

  try {
    const res = await fetch(
      "https://solana-mobile.onrender.com/claim",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress })
      }
    );

    const data = await res.json();

    if (!res.ok) {
      document.getElementById("status").innerText =
        "Ошибка: " + (data.error || "claim failed");
      return;
    }

    document.getElementById("status").innerText =
      "✅ УСПЕХ! TX: " + data.signature;

  } catch (e) {
    console.error(e);
    document.getElementById("status").innerText =
      "❌ Сервер недоступен";
  }
}
