import mongoose from "mongoose";
import { config } from "./env.js";

export const connectToDb = () => mongoose.connect(config.mongoUrl, { maxPoolSize: 50, wtimeoutMS: 2500 });

export const isDbReady = (): boolean => mongoose.connection.readyState === 1;

export const closeDb = () => mongoose.connection.close();
