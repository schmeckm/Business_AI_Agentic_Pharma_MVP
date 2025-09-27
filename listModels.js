// listModels.js
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const run = async () => {
  try {
    const models = await client.models.list();
    console.log("👉 Available models for your key:\n");
    models.data.forEach(m => console.log(`- ${m.id}`));
  } catch (err) {
    console.error("Error listing models:", err);
  }
};

run();
