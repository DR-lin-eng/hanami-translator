import { describe, expect, it } from "vitest";
import { loadApiSettings, saveApiSettings } from "../src/lib/settings";

class MemoryStorage {
  private value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }
}

describe("API settings persistence", () => {
  it("restores only the non-sensitive API settings", () => {
    const storage = new MemoryStorage();
    saveApiSettings({
      apiBase: " https://example.com/v1/ ",
      imageModel: " gpt-image-2 ",
      quality: "high",
    }, storage);

    expect(loadApiSettings(storage)).toEqual({
      apiBase: "https://example.com/v1/",
      imageModel: "gpt-image-2",
      quality: "high",
    });
  });

  it("ignores invalid persisted values", () => {
    const storage = new MemoryStorage();
    storage.setItem("unused", JSON.stringify({
      apiBase: 42,
      imageModel: "",
      quality: "ultra",
      apiKey: "must-not-be-loaded",
    }));

    expect(loadApiSettings(storage)).toEqual({});
  });
});
