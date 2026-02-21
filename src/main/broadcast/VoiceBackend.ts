import { Readable } from "stream";

export type AudioStreamPayload = {
  opusStream: Readable;
  pcmStream: Readable;
  channels: number;
  frameSize: number;
  sampleRate: number;
};

export type VoicePlatform = "discord" | "fluxer";

export interface VoiceBackend {
  destroy(): void;
  startStream(payload: AudioStreamPayload): void;
  stopStream(): void;
}

