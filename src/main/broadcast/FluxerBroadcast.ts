import { BrowserWindow, ipcMain } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { Client } from "@fluxerjs/core";
import { VoiceManager } from "@fluxerjs/voice";
import { AudioStreamPayload, VoiceBackend } from "./VoiceBackend";

const featureEnabled = process.env.KENKU_ENABLE_FLUXER !== "0";

export class FluxerBroadcast implements VoiceBackend {
  window: BrowserWindow;
  client: any;
  voiceManager: any;
  connection: any;
  ffmpeg?: ChildProcessWithoutNullStreams;

  constructor(window: BrowserWindow) {
    this.window = window;
    ipcMain.on("FLUXER_CONNECT", this._handleConnect);
    ipcMain.on("FLUXER_DISCONNECT", this._handleDisconnect);
    ipcMain.on("FLUXER_JOIN_CHANNEL", this._handleJoinChannel);
    ipcMain.on("FLUXER_LEAVE_CHANNEL", this._handleLeaveChannel);
  }

  destroy() {
    ipcMain.off("FLUXER_CONNECT", this._handleConnect);
    ipcMain.off("FLUXER_DISCONNECT", this._handleDisconnect);
    ipcMain.off("FLUXER_JOIN_CHANNEL", this._handleJoinChannel);
    ipcMain.off("FLUXER_LEAVE_CHANNEL", this._handleLeaveChannel);
    this.stopStream();
    this.connection?.disconnect?.();
    this.client?.destroy?.();
    this.client = undefined;
    this.voiceManager = undefined;
    this.connection = undefined;
  }

  startStream(payload: AudioStreamPayload) {
    if (!this.connection || !featureEnabled) {
      return;
    }
    this.stopStream();

    const ffmpeg = spawn("ffmpeg", [
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ar",
      String(payload.sampleRate),
      "-ac",
      String(payload.channels),
      "-i",
      "pipe:0",
      "-c:a",
      "libopus",
      "-application",
      "audio",
      "-b:a",
      "128k",
      "-f",
      "webm",
      "-dash",
      "1",
      "pipe:1",
    ]);

    ffmpeg.on("error", (error) => {
      this.window.webContents.send("ERROR", `Fluxer ffmpeg error: ${error.message}`);
    });
    ffmpeg.stderr.on("data", (data) => {
      const message = String(data).trim();
      if (message) {
        this.window.webContents.send("ERROR", `Fluxer ffmpeg: ${message}`);
      }
    });

    (payload.pcmStream as any).pipe(ffmpeg.stdin as any);
    this.connection.play(ffmpeg.stdout);
    this.ffmpeg = ffmpeg;
  }

  stopStream() {
    if (this.ffmpeg) {
      this.ffmpeg.stdin.destroy();
      this.ffmpeg.stdout.destroy();
      this.ffmpeg.kill("SIGKILL");
      this.ffmpeg = undefined;
    }
    this.connection?.stop?.();
  }

  _handleConnect = async (event: Electron.IpcMainEvent, token: string) => {
    if (!featureEnabled) {
      event.reply("FLUXER_DISCONNECTED");
      event.reply(
        "ERROR",
        "Fluxer backend is disabled. Set KENKU_ENABLE_FLUXER=1 (or omit it) to enable it.",
      );
      return;
    }

    try {
      this.client?.destroy?.();
      this.client = new Client();
      this.voiceManager = new VoiceManager(this.client);

      this.client.once("ready", async () => {
        event.reply("FLUXER_READY");
        event.reply("MESSAGE", "Connected to Fluxer");

        try {
          const rawGuilds = await this.client.user.fetchGuilds();
          const guilds = await Promise.all(
            rawGuilds.map(async (guild: any) => {
              const voiceChannels: any[] = [];
              const channels = await guild.fetchChannels();
              channels.forEach((channel: any) => {
                if (channel && channel.isVoice()) {
                  voiceChannels.push({
                    id: channel.id,
                    name: channel.name,
                  });
                }
              });
              return {
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL(),
                voiceChannels,
              };
            })
          );
          event.reply("FLUXER_GUILDS", guilds);
        } catch (err) {
          this.window.webContents.send(
            "ERROR",
            `Error fetching Fluxer guilds: ${err.message}`,
          );
        }
      });

      this.client.on("error", (err: any) => {
        event.reply("FLUXER_DISCONNECTED");
        event.reply("ERROR", `Error connecting to Fluxer bot: ${err.message}`);
      });

      await this.client.login(token);
    } catch (err) {
      event.reply("FLUXER_DISCONNECTED");
      event.reply("ERROR", `Error connecting to Fluxer bot: ${err.message}`);
    }
  };

  _handleDisconnect = async (event: Electron.IpcMainEvent) => {
    this.stopStream();
    this.connection?.disconnect?.();
    this.connection = undefined;
    this.client?.destroy?.();
    this.client = undefined;
    this.voiceManager = undefined;
    event.reply("FLUXER_DISCONNECTED");
    event.reply("FLUXER_CHANNEL_LEFT", "");
  };

  _handleJoinChannel = async (
    event: Electron.IpcMainEvent,
    channelId: string,
  ) => {
    if (!this.client || !this.voiceManager) {
      event.reply("FLUXER_CHANNEL_LEFT", channelId);
      event.reply("ERROR", "Fluxer client is not connected.");
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && channel.isVoice()) {
        this.connection?.disconnect?.();
        this.connection = await this.voiceManager.join(channel);
        event.reply("FLUXER_CHANNEL_JOINED", channelId);
      } else {
        event.reply("FLUXER_CHANNEL_LEFT", channelId);
        event.reply("ERROR", "Channel not found or is not a voice channel.");
      }
    } catch (err) {
      event.reply("FLUXER_CHANNEL_LEFT", channelId);
      event.reply("ERROR", `Error connecting to Fluxer voice channel: ${err.message}`);
    }
  };

  _handleLeaveChannel = async (
    event: Electron.IpcMainEvent,
    channelId: string,
  ) => {
    this.stopStream();
    if (this.voiceManager) {
      this.voiceManager.leaveChannel(channelId);
    }
    this.connection = undefined;
    event.reply("FLUXER_CHANNEL_LEFT", channelId);
  };
}
