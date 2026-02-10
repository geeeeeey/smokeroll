import "dotenv/config";
import { startServer } from "./server.js";
import { startBot } from "./bot.js";

const port = Number(process.env.PORT || 3000);

startServer(port);

if (process.env.BOT_TOKEN) {
  startBot();
} else {
  console.log("BOT_TOKEN not set -> bot is disabled (API only)");
}
