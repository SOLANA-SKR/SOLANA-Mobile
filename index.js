const express = require("express");
const app = express();

app.use(express.json());

// ПРОВЕРКА ЧТО СЕРВЕР ЖИВОЙ
app.get("/", (req, res) => {
  res.send("SERVER OK");
});

// ЧТОБЫ /claim ОТКРЫВАЛСЯ В БРАУЗЕРЕ
const sendSKR = require("./solana");

app.post("/claim", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: "wallet required" });
    }

    const signature = await sendSKR(wallet);

    res.json({
      ok: true,
      signature,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message || "claim failed",
    });
  }
});

