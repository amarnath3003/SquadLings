// Offline browser checks: prove the planted failures exist, and disappear with --bugs none.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { createBuggyMart } from "./server.ts";

for (const mode of ["all", "none"]) {
  test(`BuggyMart with bugs ${mode}`, async t => {
    const server = createBuggyMart(mode);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const broken = mode === "all";
    const check = async (name: string, fn: (page: Page) => Promise<void>) => t.test(name, async () => {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      try { await fn(page); assert.deepEqual(errors, [], "No accidental JavaScript failures"); }
      finally { await context.close(); }
    });
    const addMug = async (page: Page) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Add Nimbus Mug to cart" }).click();
      await page.getByRole("link", { name: /^Cart \(/ }).click();
      await page.getByRole("heading", { name: "Your cart", exact: true }).waitFor();
    };
    await check("BM-01: price sorting", async page => {
      await page.goto("/");
      await page.getByLabel("Sort by", { exact: true }).selectOption("low");
      await page.waitForURL("**/search?sort=low");
      await page.locator(".product").first().waitFor();
      const prices = await page.locator(".product .price").allTextContents();
      assert.deepEqual(prices, broken ? ["$65.00", "$59.00", "$49.00", "$35.00", "$14.00", "$9.00"] : ["$9.00", "$14.00", "$35.00", "$49.00", "$59.00", "$65.00"]);
    });
    await check("BM-02: negative quantity", async page => {
      await addMug(page);
      await page.getByLabel("Quantity for Nimbus Mug").fill("-2");
      await page.getByLabel("Quantity for Nimbus Mug").press("Tab");
      assert.equal(await page.getByLabel("Quantity for Nimbus Mug").inputValue(), broken ? "-2" : "1");
      assert.equal(await page.locator("#total").textContent(), broken ? "−$23.00" : "$19.00");
    });
    await check("BM-03: Large variant", async page => {
      await page.goto("/product/aurora-lamp");
      await page.getByLabel("Size", { exact: true }).selectOption("Large");
      assert.equal(await page.locator("#product-price").textContent(), broken ? "$NaN" : "$69.00");
      assert.equal((await page.locator("#description").textContent()) === "undefined", broken);
    });
    await check("BM-04: remove cart item", async page => {
      await addMug(page);
      await page.getByRole("button", { name: "Remove Nimbus Mug" }).click();
      assert.equal(await page.locator(".cart-row").count(), broken ? 1 : 0);
      assert.equal(await page.getByRole("status").textContent(), "Item removed from your cart.");
    });
    await check("BM-05: one click adds one item", async page => {
      await addMug(page);
      assert.equal(await page.getByLabel("Quantity for Nimbus Mug").inputValue(), broken ? "2" : "1");
      await page.reload();
      await page.locator(".cart-row").waitFor();
      assert.equal(await page.getByLabel("Quantity for Nimbus Mug").inputValue(), broken ? "2" : "1");
    });
    await check("BM-06: empty checkout", async page => {
      await page.goto("/cart");
      await page.getByRole("link", { name: "Checkout →" }).click();
      if (!broken) {
        await page.getByRole("heading", { name: "Your cart is empty" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Place demo order" }).count(), 0);
        return;
      }
      await page.getByLabel("Full name").fill("Demo Tester");
      await page.getByLabel("Email", { exact: true }).fill("demo@example.test");
      await page.getByLabel("Street address").fill("12 Test Lane");
      await page.getByLabel("City").fill("Test Town");
      await page.getByLabel("Postal code").fill("12345");
      await page.getByRole("button", { name: "Place demo order" }).click();
      await page.getByRole("heading", { name: "You're all set." }).waitFor();
      assert.match(await page.locator("main").innerText(), /Items ordered\s+0/);
      assert.match(await page.locator("main").innerText(), /Order total\s+\$0.00/);
    });
    await check("BM-07: category filter", async page => {
      await page.goto("/");
      await page.getByLabel("Category", { exact: true }).selectOption("Audio");
      await page.waitForURL("**/search?category=Audio");
      await page.locator(".product").first().waitFor();
      assert.equal(await page.locator(".product").count(), broken ? 6 : 1);
      if (!broken) assert.equal(await page.locator(".product h3").textContent(), "Pebble Speaker");
    });
    await check("BM-08: special-character search", async page => {
      for (const query of ["50%", "🍕"]) {
        await page.goto("/");
        await page.getByRole("searchbox", { name: "Search products" }).fill(query);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await page.waitForURL("**/search?q=*");
        await page.getByRole("heading", { name: broken ? "500 — Search failed" : "No products found" }).waitFor();
      }
    });
    await check("BM-09: SAVE10 reduces the total", async page => {
      await addMug(page);
      await page.getByLabel("Quantity for Nimbus Mug").fill("1");
      await page.getByLabel("Quantity for Nimbus Mug").press("Tab");
      await page.getByLabel("Promo code").fill("SAVE10");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      assert.equal(await page.locator("#total").textContent(), broken ? "$20.40" : "$17.60");
      await page.reload();
      await page.locator("#total").waitFor();
      assert.equal(await page.locator("#total").textContent(), broken ? "$20.40" : "$17.60");
    });
    await check("BM-10: mug image loads", async page => {
      await page.goto("/");
      await page.locator(".product").first().waitFor();
      const image = page.locator(".art-mug img");
      assert.equal(await image.count(), broken ? 1 : 0);
      if (broken) assert.equal(await image.evaluate((img: HTMLImageElement) => img.naturalWidth), 0);
      else assert.equal(await page.locator(".art-mug .emoji").textContent(), "☕");
    });
    await check("normal search, reset, tab isolation, and mobile layout", async page => {
      await page.goto("/search?q=FERN");
      await page.locator(".product").waitFor();
      assert.equal(await page.locator(".product h3").textContent(), "Fern Notebook");
      await addMug(page);
      const other = await page.context().newPage();
      await other.goto("/cart");
      await other.getByRole("heading", { name: "Your cart is empty" }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole("button", { name: "Reset demo" }).click();
      await page.waitForURL(baseURL + "/");
      await page.getByRole("link", { name: "Cart (0)", exact: true }).waitFor();
      await page.goto("/cart");
      await page.getByRole("heading", { name: "Your cart is empty" }).waitFor();
    });
    await check("valid checkout works and required fields block empty submission", async page => {
      await addMug(page);
      await page.getByRole("link", { name: "Checkout →" }).click();
      await page.getByRole("button", { name: "Place demo order" }).click();
      assert.match(page.url(), /\/checkout$/);
      await page.getByLabel("Full name").fill("Demo Tester");
      await page.getByLabel("Email", { exact: true }).fill("demo@example.test");
      await page.getByLabel("Street address").fill("12 Test Lane");
      await page.getByLabel("City").fill("Test Town");
      await page.getByLabel("Postal code").fill("12345");
      await page.getByRole("button", { name: "Place demo order" }).click();
      await page.getByRole("heading", { name: "You're all set." }).waitFor();
      assert.match(await page.locator("main").innerText(), broken ? /Items ordered\s+2/ : /Items ordered\s+1/);
      await page.getByRole("link", { name: "Cart (0)", exact: true }).waitFor();
    });
    await t.test("answer key, source, and unknown routes are not served", async () => {
      for (const path of ["/planted-bugs.json", "/README.md", "/server.ts", "/.env", "/unknown"]) {
        assert.equal((await fetch(baseURL + path)).status, 404);
      }
    });
  });
}

test("individual bugs can be enabled without enabling the others", async t => {
  const server = createBuggyMart("BM-02,BM-09");
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/config.json`;
  assert.deepEqual(await fetch(url).then(res => res.json()), { enabled: ["BM-02", "BM-09"] });
  assert.throws(() => createBuggyMart("BM-99"), /Unknown bug/);
});
