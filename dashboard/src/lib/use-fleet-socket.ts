"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export type DeviceStatusEvent = {
  device_id: string;
  hardware_id: string;
  status: "online" | "degraded" | "offline";
  last_seen_at: string;
  screen_on?: boolean | null;
};

export type CommandAckEvent = {
  device_id: string;
  command_id: string;
  status: "ACK" | "COMPLETED" | "FAILED";
  screenshot_url?: string;
  error_message?: string;
};

type FleetSocketHandlers = {
  onDeviceStatus?: (event: DeviceStatusEvent) => void;
  onCommandAck?: (event: CommandAckEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
};

type TicketResponse = {
  ticket: string;
  socket_url: string;
};

/**
 * Opens an authenticated dashboard socket with a short-lived, socket-only ticket.
 * The long-lived dashboard access token remains in its HttpOnly cookie.
 */
export function useFleetSocket(handlers: FleetSocketHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connecting = false;
    let retryAttempt = 0;

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      const cap = Math.min(30_000, 1_000 * 2 ** Math.min(retryAttempt, 5));
      const delay = Math.round(cap / 2 + Math.random() * cap / 2);
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed || connecting || socket?.connected) return;
      connecting = true;
      try {
        const response = await fetch("/api/socket-ticket", {
          method: "POST",
          cache: "no-store"
        });
        if (response.status === 401 || response.status === 403) {
          handlersRef.current.onConnectionChange?.(false);
          return;
        }
        if (!response.ok) throw new Error("socket ticket unavailable");

        const ticket = (await response.json()) as TicketResponse;
        if (disposed) return;

        socket?.removeAllListeners();
        socket?.disconnect();
        socket = io(`${ticket.socket_url.replace(/\/$/, "")}/dashboard`, {
          auth: { token: ticket.ticket },
          transports: ["websocket", "polling"],
          upgrade: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1_000,
          reconnectionDelayMax: 15_000,
          randomizationFactor: 0.5,
          timeout: 15_000
        });

        socket.on("connect", () => {
          retryAttempt = 0;
          handlersRef.current.onConnectionChange?.(true);
        });
        socket.on("disconnect", () => handlersRef.current.onConnectionChange?.(false));
        socket.on("connect_error", () => {
          handlersRef.current.onConnectionChange?.(false);
          // A reconnect may use an expired five-minute ticket. Recreate the
          // socket with a fresh ticket after the built-in quick retries.
          if (socket && !socket.active) scheduleReconnect();
        });
        socket.on("DEVICE_STATUS", (event: DeviceStatusEvent) => {
          if (event?.device_id) handlersRef.current.onDeviceStatus?.(event);
        });
        socket.on("COMMAND_ACK", (event: CommandAckEvent) => {
          if (event?.command_id) handlersRef.current.onCommandAck?.(event);
        });
      } catch {
        handlersRef.current.onConnectionChange?.(false);
        scheduleReconnect();
      } finally {
        connecting = false;
      }
    };

    const handleOnline = () => void connect();
    window.addEventListener("online", handleOnline);
    void connect();

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      if (retryTimer) clearTimeout(retryTimer);
      socket?.removeAllListeners();
      socket?.disconnect();
      handlersRef.current.onConnectionChange?.(false);
    };
  }, []);
}