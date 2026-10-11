import { readFile, rename, access } from "node:fs/promises";

// Keep the management entry separate so Vercel can choose the public home by host.
await rename("dist/index.html", "dist/app.html");
for (const name of ["index", "contato"]) {
  const html = await readFile(`dist/site/${name}.html`, "utf8");
  if (!html.includes('href="/inicio"') || html.includes("noindex,nofollow"))
    throw new Error("Public site is not ready: " + name);
  for (const [, path] of html.matchAll(/(?:src|href)="(\/site\/[^"#]+)"/g))
    await access("dist" + path);
}
console.log("Public site and management entry verified.");
