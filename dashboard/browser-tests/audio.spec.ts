import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

async function diagnostics(page: Page) {
  return page.evaluate(async () =>
    (await import("/src/effects/sound.ts")).getAudioDiagnostics(),
  );
}
async function enable(page: Page) {
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Turn sound off", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/lab");
});

test("muted startup, keyboard enable, accessible settings and saved mix", async ({
  page,
}) => {
  expect((await diagnostics(page)).contextState).toBe("uninitialized");
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Turn sound off", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sound settings", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Master volume" }),
  ).toBeFocused();
  await page.getByRole("slider", { name: "Master volume" }).fill("47");
  await page.getByRole("checkbox", { name: "Bot voices" }).uncheck();
  await expect(
    page.getByRole("checkbox", { name: "Idle chatter" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Idle chatter" }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Sound settings", exact: true }),
  ).toBeFocused();
  await page.reload();
  expect((await diagnostics(page)).contextState).toBe("uninitialized");
  await page
    .getByRole("button", { name: "Sound settings", exact: true })
    .click();
  await expect(page.getByRole("slider", { name: "Master volume" })).toHaveValue(
    "47",
  );
  await expect(
    page.getByRole("checkbox", { name: "Bot voices" }),
  ).not.toBeChecked();
});

test("standard controls emit once; reselect, text typing and hover stay silent", async ({
  page,
}) => {
  await enable(page);
  await page.waitForTimeout(300);
  let before = (await diagnostics(page)).effects;
  await page
    .getByRole("button", { name: "Character studio", exact: true })
    .click();
  expect((await diagnostics(page)).effects).toBe(before);
  await page
    .getByRole("button", { name: "Squad in action", exact: true })
    .click();
  expect((await diagnostics(page)).effects).toBe(before + 1);
  before++;
  await page.getByLabel("8 fps load streams").check();
  expect((await diagnostics(page)).effects).toBe(before + 1);
  await page.waitForTimeout(200);
  before = (await diagnostics(page)).effects;
  await page.getByLabel("Seed", { exact: true }).fill("typing-is-quiet");
  await page.getByRole("button", { name: "Face gallery", exact: true }).hover();
  expect((await diagnostics(page)).effects).toBe(before);
});

test("single voice, bounded effects/queue, urgent preemption and cancellation", async ({
  page,
}) => {
  await enable(page);
  await page.waitForTimeout(300);
  const result = await page.evaluate(async () => {
    const audio = await import("/src/effects/sound.ts");
    audio.playVoice("bot3", "sleep", { scope: "room", priority: 1 });
    // Direct requests preempt idle; queued requests remain bounded.
    for (const id of ["bot1", "bot2", "bot3", "bot4", "bot5"] as const)
      audio.playVoice(id, "greeting", { scope: "preview" });
    for (const cue of [
      "launch",
      "planning",
      "ready",
      "found",
      "dance",
    ] as const)
      audio.playUi(cue);
    const busy = audio.getAudioDiagnostics();
    audio.stopAudio();
    audio.playVoice("bot3", "sleep", { scope: "room", priority: 1 });
    audio.playVoice("bot1", "failure", { scope: "workflow", priority: 5 });
    const urgent = audio.useAudio.getState().speaking;
    audio.voiceSequence(
      ["bot1", "bot2", "bot3", "bot4", "bot5"],
      "success",
      "workflow",
    );
    audio.stopAudio("workflow");
    return { busy, urgent, stopped: audio.getAudioDiagnostics() };
  });
  expect(result.busy.maxVoices).toBe(1);
  expect(result.busy.maxEffects).toBeLessThanOrEqual(4);
  expect(result.busy.queued).toBeLessThanOrEqual(2);
  expect(result.urgent).toMatchObject({ id: "bot1", reaction: "failure" });
  expect(result.stopped).toMatchObject({
    activeVoices: 0,
    queued: 0,
    scheduled: 0,
  });
  const before = (await diagnostics(page)).voices;
  await page.waitForTimeout(900);
  expect((await diagnostics(page)).voices).toBe(before);
});

test("greetings include all five voices; mute cancels play and reduced motion keeps audio", async ({
  page,
}) => {
  await enable(page);
  await page.waitForTimeout(300);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Say hello", exact: true }).click();
  await expect(page.locator(".room-roster [data-speaking=true]")).toHaveCount(
    1,
  );
  await expect(page.locator(".room-roster .speaking-halo")).toHaveClass(
    /speaking-still/,
  );
  await page.waitForTimeout(3300);
  const trace = (await diagnostics(page)).trace.filter(
    (r: { channel: string; label: string; scope: string }) =>
      r.channel === "voice" && r.label === "greeting" && r.scope === "room",
  );
  expect(new Set(trace.map((r: { id?: string }) => r.id)).size).toBe(5);
  await page.getByRole("button", { name: "Dance break", exact: true }).click();
  await page
    .getByRole("button", { name: "Turn sound off", exact: true })
    .click();
  expect(await diagnostics(page)).toMatchObject({
    activeVoices: 0,
    activeEffects: 0,
    scheduled: 0,
    queued: 0,
  });
  await expect(page.locator("[data-speaking=true]")).toHaveCount(0);
});

test("workflow duplicates sound once, approvals interrupt room sequences, reset and hide cancel", async ({
  page,
}) => {
  await enable(page);
  await page.waitForTimeout(300);
  const result = await page.evaluate(async () => {
    const audio = await import("/src/effects/sound.ts");
    const { consumeEvent } = await import("/src/ingest.ts");
    const { makeEvent } = await import("/src/lab/fakeRun.ts");
    audio.voiceSequence(
      ["bot1", "bot2", "bot3", "bot4", "bot5"],
      "greeting",
      "room",
    );
    const event = makeEvent(
      "approval.requested",
      {
        approval: {
          id: "audio-a",
          runId: "r",
          botId: "bot2",
          status: "pending",
          kind: "confirm",
          title: "Audio check",
          detail: "Local test",
          createdAt: 0,
          expiresAt: 300000,
        },
      },
      1000,
      55000,
    );
    consumeEvent(event, { reduced: true, speed: 4 });
    const first = audio.getAudioDiagnostics();
    consumeEvent(event, { reduced: true, speed: 4 });
    const duplicate = audio.getAudioDiagnostics();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    const hidden = audio.getAudioDiagnostics();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return { first, duplicate, hidden };
  });
  expect(result.duplicate.voices).toBe(result.first.voices);
  expect(result.duplicate.effects).toBe(result.first.effects);
  expect(result.first.scheduled).toBe(0);
  expect(result.first.trace.at(-1)).toMatchObject({
    channel: "voice",
    label: "question",
    id: "bot2",
  });
  expect(result.hidden).toMatchObject({
    activeVoices: 0,
    activeEffects: 0,
    queued: 0,
    scheduled: 0,
  });
  await page
    .getByRole("button", { name: "Squad in action", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset playground", exact: true })
    .click();
  expect((await diagnostics(page)).scheduled).toBe(0);
});

test("failed audio initialization leaves controls muted with a useful retry message", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw new Error("Unavailable");
        }
      },
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Audio could not start");
  await expect(
    page.getByRole("button", { name: "Turn sound on", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  expect((await diagnostics(page)).activeVoices).toBe(0);
});

test("all synthesized variants render finite, bounded, audible audio with silent tails", async ({
  page,
}) => {
  test.setTimeout(90000);
  const report = await page.evaluate(async () => {
    const { renderVoice, renderEffect } = await import(
      "/src/effects/audio/synthesis.ts"
    );
    const { REACTIONS, EFFECTS } = await import(
      "/src/effects/audio/catalogue.ts"
    );
    const results: {
        name: string;
        peak: number;
        rms: number;
        duration: number;
      }[] = [],
      audition: number[] = [];
    const inspect = async (
      name: string,
      render: (ctx: OfflineAudioContext) => { duration: number },
      save = false,
    ) => {
      const context = new OfflineAudioContext(1, 22050, 22050),
        { duration } = render(context);
      const buffer = await context.startRendering(),
        data = buffer.getChannelData(0);
      let peak = 0,
        sum = 0,
        tail = 0;
      for (let i = 0; i < data.length; i++) {
        if (!Number.isFinite(data[i]))
          throw new Error(`${name}: non-finite sample`);
        peak = Math.max(peak, Math.abs(data[i]));
        sum += data[i] ** 2;
        if (i / 22050 > duration + 0.04)
          tail = Math.max(tail, Math.abs(data[i]));
      }
      if (peak < 0.0001 || peak > 0.95 || tail > 0.00001 || duration > 0.9)
        throw new Error(
          `${name}: peak=${peak}, tail=${tail}, duration=${duration}`,
        );
      results.push({ name, peak, rms: Math.sqrt(sum / data.length), duration });
      if (save)
        audition.push(...data.slice(0, Math.ceil((duration + 0.18) * 22050)));
    };
    for (const id of ["bot1", "bot2", "bot3", "bot4", "bot5"] as const)
      for (const reaction of REACTIONS)
        for (let variant = 0; variant < 3; variant++)
          await inspect(
            `${id}/${reaction}/${variant}`,
            (ctx) => renderVoice(ctx, ctx.destination, id, reaction, variant),
            variant === 0,
          );
    for (const cue of Object.keys(EFFECTS))
      await inspect(`effect/${cue}`, (ctx) =>
        renderEffect(ctx, ctx.destination, cue as keyof typeof EFFECTS),
      );
    return { results, audition };
  });
  expect(report.results.length).toBeGreaterThan(230);
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/audio-rendering.json",
    JSON.stringify(report.results, null, 2),
  );
  const data = report.audition,
    wav = Buffer.alloc(44 + data.length * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(data.length * 2, 40);
  data.forEach((value: number, index: number) =>
    wav.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      44 + index * 2,
    ),
  );
  writeFileSync("artifacts/voice-audition.wav", wav);
});
