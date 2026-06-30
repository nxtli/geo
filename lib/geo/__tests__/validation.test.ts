import { describe, it, expect } from "vitest";
import { normalizePhone } from "../validation";

describe("normalizePhone", () => {
  const accept: Array<[string, string]> = [
    ["0612345678", "0612345678"],
    ["06 12345678", "0612345678"],
    ["06-12345678", "0612345678"],
    ["+31612345678", "0612345678"],
    ["+31 6 12345678", "0612345678"],
    ["+31 (0)6 12345678", "0612345678"],
    ["0031612345678", "0612345678"],
    ["0031 (0)6 12345678", "0612345678"],
  ];
  it.each(accept)("accepts %s as a NL mobile", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  const reject = [
    "0201234567", // landline
    "+31201234567", // international landline
    "061234567", // 9 digits
    "06123456789", // 11 digits
    "0712345678", // not 06
    "abc",
    "+1 202 555 0143", // foreign
    "",
  ];
  it.each(reject)("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
