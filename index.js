const express = require("express");
const app = express();

app.use(express.json());

// ПРОВЕРКА ЧТО СЕРВЕР ЖИВОЙ
app.get("/", (req, res) => {
  res.send("SERVER OK");
});

// ЧТОБЫ /claim ОТКРЫВАЛСЯ В БРАУЗЕРЕ
app.get("/claim", (req, res) => {
  res.send("CLAIM ENDPOINT OK. USE POST.");
});

// ЭТО ДЛЯ КНОПКИ НА САЙТЕ
app.post("/claim", (req, res) => {
  console.log("CLAIM BODY:", req.body);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("SERVER STARTED ON PORT", PORT);
});

