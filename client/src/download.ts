import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import { URL } from "url";

const MAX_REDIRECTS = 10;

export async function download(
  url: string,
  dest: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  redirects = 0,
): Promise<void> {
  if (redirects > MAX_REDIRECTS) {
    throw new Error("Too many redirects");
  }

  const fetch = (urlObj: URL) =>
    urlObj.protocol === "https:" ? https.get : http.get;

  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest, { flags: "w" });

    const request = fetch(urlObj)(urlObj, (response) => {
      const status = response.statusCode ?? 0;

      // 🔁 Handle redirect
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;

        if (!location) {
          reject(new Error(`Redirect (${status}) without Location header`));
          return;
        }

        file.close();

        const nextUrl = new URL(location, urlObj).toString();

        resolve(
          download(nextUrl, dest, progress, redirects + 1)
            .then(resolve)
            .catch(reject),
        );
        return;
      }

      // ❌ HTTP error
      if (status !== 200) {
        response.resume();
        file.close();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      const total = parseInt(response.headers["content-length"] || "0", 10);
      let received = 0;

      response.on("data", (chunk: Buffer) => {
        received += chunk.length;

        if (total) {
          const percent = (received / total) * 100;
          progress.report({
            message: `${percent.toFixed(0)}%`,
            increment: (chunk.length / total) * 100,
          });
        } else {
          progress.report({
            message: `${(received / 1024 / 1024).toFixed(1)} MB`,
          });
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close(() => resolve());
      });

      file.on("error", (err) => {
        file.close();
        reject(err);
      });

      response.on("error", (err) => {
        file.close();
        reject(err);
      });
    });

    request.on("error", (err) => {
      file.close();
      reject(err);
    });

    request.setTimeout(30_000, () => {
      file.close();
      request.destroy(new Error("Download timed out"));
    });
  });
}
