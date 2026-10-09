// server.js
import app from "./app.js";

const PORT = process.env.PORT || 3100;

app.listen(PORT, () => {
  console.log(`Tool Tracker running on http://localhost:${PORT}`);
});
