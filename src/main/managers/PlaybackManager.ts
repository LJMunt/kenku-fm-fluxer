import { BrowserWindow, ipcMain } from "electron";
import { DiscordBroadcast } from "../broadcast/DiscordBroadcast";
import { FluxerBroadcast } from "../broadcast/FluxerBroadcast";
import { AudioStreamPayload, VoiceBackend, VoicePlatform } from "../broadcast/VoiceBackend";
import { AudioCaptureManagerMain } from "./AudioCaptureManagerMain";

export class PlaybackManager {
  discord: DiscordBroadcast;
  fluxer: FluxerBroadcast;
  platform: VoicePlatform = "discord";
  audioCaptureManager: AudioCaptureManagerMain;
  activeBackend: VoiceBackend;
  currentStream?: AudioStreamPayload;

  constructor(window: BrowserWindow) {
    this.discord = new DiscordBroadcast(window);
    this.fluxer = new FluxerBroadcast(window);
    this.activeBackend = this.discord;
    this.audioCaptureManager = new AudioCaptureManagerMain();
    this.audioCaptureManager.on("streamStart", (payload: AudioStreamPayload) => {
      this.currentStream = payload;
      this.activeBackend.startStream(payload);
    });
    this.audioCaptureManager.on("streamEnd", () => {
      this.currentStream = undefined;
      this.activeBackend.stopStream();
    });
    ipcMain.on("VOICE_SET_PLATFORM", this._handleSetPlatform);
  }

  destroy() {
    ipcMain.off("VOICE_SET_PLATFORM", this._handleSetPlatform);
    this.discord.destroy();
    this.fluxer.destroy();
    this.audioCaptureManager.destroy();
  }

  _handleSetPlatform = (_: Electron.IpcMainEvent, platform: VoicePlatform) => {
    this.platform = platform;
    this.activeBackend.stopStream();
    this.activeBackend = platform === "fluxer" ? this.fluxer : this.discord;
    if (this.currentStream) {
      this.activeBackend.startStream(this.currentStream);
    }
  };
}
