import mongoose from "mongoose";

type MongoConnectionOptions = {
  maxPoolSize: number;
  minPoolSize: number;
  autoIndex: boolean;
  connectTimeoutMS?: number | undefined;
  serverSelectionTimeoutMS?: number | undefined;
  socketTimeoutMS?: number | undefined;
  waitQueueTimeoutMS?: number | undefined;
  heartbeatFrequencyMS?: number | undefined;
};

export async function connectMongo(uri: string, options: MongoConnectionOptions = { maxPoolSize: 100, minPoolSize: 5, autoIndex: true }): Promise<void> {
  await mongoose.connect(uri, {
    maxPoolSize: options.maxPoolSize,
    minPoolSize: Math.min(options.minPoolSize, options.maxPoolSize),
    maxIdleTimeMS: 60_000,
    connectTimeoutMS: options.connectTimeoutMS ?? 10_000,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 10_000,
    socketTimeoutMS: options.socketTimeoutMS ?? 45_000,
    waitQueueTimeoutMS: options.waitQueueTimeoutMS ?? 10_000,
    heartbeatFrequencyMS: options.heartbeatFrequencyMS ?? 10_000,
    autoIndex: options.autoIndex
  });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}