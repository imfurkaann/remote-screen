import { Schema, model } from "mongoose";

export const COMMAND_TYPES = ["REBOOT_APP", "SCREENSHOT", "SET_VOLUME", "FORCE_REFRESH", "SCREEN_ON", "SCREEN_OFF", "SET_ORIENTATION", "SET_OPERATING_HOURS", "SET_SCALE_MODE", "CLEAR_CACHE", "FACTORY_RESET", "GET_DIAGNOSTICS"] as const;
export const COMMAND_STATUSES = [
  "queued",
  "sent",
  "acknowledged",
  "completed",
  "failed",
  "timeout"
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export type CommandDoc = {
  tenantId: string;
  deviceId: string;
  requestedByUserId: string | null;
  commandId: string;
  commandType: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  sentAt: Date | null;
  ackAt: Date | null;
  completedAt: Date | null;
  timeoutAt: Date | null;
  screenshotUrl: string | null;
  errorMessage: string | null;
};

const CommandSchema = new Schema<CommandDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    deviceId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    requestedByUserId: { type: String, default: null, trim: true, maxlength: 64 },
    commandId: { type: String, required: true, trim: true, maxlength: 64 },
    commandType: {
      type: String,
      required: true,
      enum: COMMAND_TYPES
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      required: true,
      enum: COMMAND_STATUSES,
      default: "queued",
      index: true
    },
    attempts: { type: Number, required: true, default: 0, min: 0, max: 5 },
    maxAttempts: { type: Number, required: true, default: 2, min: 1, max: 5 },
    timeoutMs: { type: Number, required: true, default: 15000, min: 2000, max: 60000 },
    sentAt: { type: Date, default: null },
    ackAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    timeoutAt: { type: Date, default: null },
    screenshotUrl: { type: String, default: null, maxlength: 4096 },
    errorMessage: { type: String, default: null, maxlength: 2000 }
  },
  { timestamps: true }
);

CommandSchema.index({ tenantId: 1, deviceId: 1, commandId: 1 }, { unique: true });
CommandSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
CommandSchema.index({ deviceId: 1, status: 1, createdAt: 1 });
CommandSchema.index({ status: 1, timeoutAt: 1 });
CommandSchema.index({ completedAt: 1 });

export const CommandModel = model<CommandDoc>("Command", CommandSchema);
