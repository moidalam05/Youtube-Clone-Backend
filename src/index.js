import dotenv from "dotenv";
import connectDB from "./db/DB_Connect.js";

dotenv.config({
  path: "./.env",
});

connectDB();
