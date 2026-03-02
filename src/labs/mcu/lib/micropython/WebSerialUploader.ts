/*
MIT License

This utility provides a minimal Web Serial uploader for MicroPython targets.
It uses MicroPython's paste mode (Ctrl-E) to transmit a Python script and
executes it, then exits back to the regular REPL prompt.
*/

export type UploadResult = {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
};

const CTRL_A = "\x01"; // not used here (raw REPL)
const CTRL_B = "\x02"; // exit raw REPL
const CTRL_C = "\x03"; // KeyboardInterrupt
const CTRL_D = "\x04"; // End of transmission / execute
const CTRL_E = "\x05"; // Paste mode

const DEFAULT_BAUD = 115200;
const DEFAULT_TIMEOUT_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebSerialUploader {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private textEncoder = new TextEncoder();
  private textDecoder = new TextDecoder();

  get isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async requestPort(): Promise<void> {
    if (!this.isSupported) {
      throw new Error("Web Serial API is not supported in this browser.");
    }
    // Filters optional; many ESP32 boards use CP210x/CH34x bridges with varying USB IDs.
    // We let the user pick any serial device.
    this.port = await (navigator as any).serial.requestPort({});
  }

  attachPort(port: SerialPort) {
    this.port = port;
  }

  async open(options?: { baudRate?: number }): Promise<void> {
    if (!this.port) {
      throw new Error("Serial port not selected.");
    }
    const baud = options?.baudRate ?? DEFAULT_BAUD;
    try {
      await this.port.open({ baudRate: baud });
    } catch (err: any) {
      // Brief retry to handle just-closed ports on macOS
      await sleep(200);
      try {
        await this.port.open({ baudRate: baud });
      } catch (err2: any) {
        const msg = err2?.message ? String(err2.message) : String(err2);
        if (msg.includes("Failed to open serial port")) {
          throw new Error(
            "Failed to open serial port. It may be in use by another app or the Serial Monitor. Close other serial connections and try again."
          );
        }
        throw err2;
      }
    }
    this.writer = this.port.writable?.getWriter() ?? null;
    this.reader = this.port.readable?.getReader() ?? null;
  }

  private async write(text: string): Promise<void> {
    if (!this.writer) throw new Error("Writer not available");
    const data = this.textEncoder.encode(text);
    await this.writer.write(data);
  }

  private async readAvailable(timeoutMs: number): Promise<string> {
    if (!this.reader) return "";
    const start = Date.now();
    let output = "";
    while (Date.now() - start < timeoutMs) {
      const res = await Promise.race([
        this.reader.read(),
        sleep(25).then(() => ({ done: false, value: undefined as any })),
      ]);
      if (res && res.value) {
        output += this.textDecoder.decode(res.value);
        // Heuristic: stop if standard REPL prompt appears
        if (output.includes(">>> ")) break;
      }
    }
    return output;
  }

  private async ensureReplReady(): Promise<void> {
    // Send a couple Ctrl-C to get to a clean primary prompt (>>> )
    await this.write(CTRL_C);
    await sleep(100);
    await this.write(CTRL_C);
    await sleep(150);
    await this.readAvailable(500);
  }

  async upload(
    code: string,
    options?: { timeoutMs?: number; persistToFile?: boolean }
  ): Promise<UploadResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const persistToFile = options?.persistToFile ?? true; // Default to persisting
    if (!this.port) throw new Error("Serial port not selected.");
    if (!this.writer || !this.reader) throw new Error("Port not open.");

    try {
      await this.ensureReplReady();

      if (persistToFile) {
        // Stop any currently running code
        await this.write(CTRL_C);
        await sleep(100);
        await this.readAvailable(500); // Clear any output from stopped code

        // Write code to main.py file so it persists across resets
        await this.writeToFile(code, "main.py");

        // Also execute it immediately
        await this.write(CTRL_E);
        await sleep(80);
        const normalized = code.replace(/\r?\n/g, "\n");
        await this.write(normalized);
        await sleep(40);
        await this.write(CTRL_D);

        const output = await this.readAvailable(timeoutMs);
        const stderr = output.includes("Traceback") ? output : undefined;
        return {
          success: !stderr,
          message: stderr
            ? "Execution error"
            : "Code saved to main.py and executed",
          stdout: stderr ? undefined : output,
          stderr,
        };
      } else {
        // Original behavior: execute in REPL without saving
        await this.write(CTRL_E);
        await sleep(80);
        const normalized = code.replace(/\r?\n/g, "\n");
        await this.write(normalized);
        await sleep(40);
        await this.write(CTRL_D);

        const output = await this.readAvailable(timeoutMs);
        const stderr = output.includes("Traceback") ? output : undefined;
        return {
          success: !stderr,
          message: stderr ? "Execution error" : "Upload complete",
          stdout: stderr ? undefined : output,
          stderr,
        };
      }
    } catch (err: any) {
      return { success: false, message: err?.message ?? String(err) };
    }
  }

  private async writeToFile(code: string, filename: string): Promise<void> {
    // First, delete the old file if it exists
    await this.write(CTRL_E);
    await sleep(80);

    const deleteFileCode = `
import os
try:
    os.remove('${filename}')
    print('Deleted old ${filename}')
except:
    print('No existing ${filename} to delete')
`;

    await this.write(deleteFileCode);
    await sleep(40);
    await this.write(CTRL_D);
    await this.readAvailable(1000);
    await sleep(100);

    // Now write the new file using paste mode
    await this.write(CTRL_E);
    await sleep(80);

    // Python code to write the file
    const writeFileCode = `
with open('${filename}', 'w') as f:
    f.write('''${code}''')
print('Code saved to ${filename}')
`;

    await this.write(writeFileCode);
    await sleep(40);
    await this.write(CTRL_D);
    await this.readAvailable(2000); // Wait for file write to complete
    await sleep(200);
  }

  async close(): Promise<void> {
    // Best-effort, idempotent close. Never throw if already closed.
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        console.warn("Error canceling reader:", e);
      }
      try {
        this.reader.releaseLock();
      } catch (e) {
        console.warn("Error releasing reader lock:", e);
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        await this.writer.close();
      } catch (e) {
        console.warn("Error closing writer:", e);
      }
      try {
        this.writer.releaseLock();
      } catch (e) {
        console.warn("Error releasing writer lock:", e);
      }
      this.writer = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : String(e);
        if (
          e?.name === "InvalidStateError" ||
          msg.includes("already closed")
        ) {
          // ignore
        } else {
          console.warn("Error closing port:", e);
        }
      }
      this.port = null;
    }
  }
}

export async function uploadToMicroPython(code: string): Promise<UploadResult> {
  const uploader = new WebSerialUploader();
  if (!uploader.isSupported) {
    return {
      success: false,
      message: "Web Serial not supported in this browser.",
    };
  }
  await uploader.requestPort();
  await uploader.open({ baudRate: DEFAULT_BAUD });
  try {
    const res = await uploader.upload(code);
    return res;
  } finally {
    await uploader.close();
  }
}
