const express = require("express");
const claimHandler = require("./api/claim");

const app = express();
app.use(express.json());

app.post("/claim", claimHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
