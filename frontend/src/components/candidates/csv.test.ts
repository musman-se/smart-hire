import { describe, expect, it } from "vitest";

import type { Candidate } from "../../api/types";
import { candidatesToCsv, csvFileName, escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("leaves plain text alone", () => {
    expect(escapeCsvCell("Ayesha Khan")).toBe("Ayesha Khan");
    expect(escapeCsvCell(4)).toBe("4");
  });

  it("renders empty values as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes commas, newlines and edge whitespace", () => {
    expect(escapeCsvCell("Lahore, Pakistan")).toBe('"Lahore, Pakistan"');
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(escapeCsvCell(" padded ")).toBe('" padded "');
  });

  it("doubles inner quotes", () => {
    expect(escapeCsvCell('The "best" engineer')).toBe('"The ""best"" engineer"');
  });

  it("neutralises cells a spreadsheet would run as formulas", () => {
    expect(escapeCsvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
  });

  it("keeps signed numbers as they are", () => {
    expect(escapeCsvCell("-3")).toBe("-3");
    expect(escapeCsvCell("+4.5")).toBe("+4.5");
    expect(escapeCsvCell(-3)).toBe("-3");
  });

  it("escapes phone numbers a spreadsheet would compute", () => {
    expect(escapeCsvCell("+92-300-1234567")).toBe("'+92-300-1234567");
    expect(escapeCsvCell("-1-1")).toBe("'-1-1");
    expect(escapeCsvCell("+1 (555) 010-9999")).toBe("'+1 (555) 010-9999");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and escapes every cell", () => {
    expect(toCsv(["Name", "Note"], [["A", "x,y"], ["B", null]])).toBe(
      'Name,Note\r\nA,"x,y"\r\nB,',
    );
  });

  it("writes just the header for no rows", () => {
    expect(toCsv(["Name"], [])).toBe("Name");
  });
});

describe("candidatesToCsv", () => {
  const candidate: Candidate = {
    id: "c1",
    email: "ayesha@example.com",
    full_name: "Ayesha Khan",
    phone: null,
    headline: "Backend, data",
    years_experience: 5,
    skills: ["python", "sql"],
    resume_url: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  };

  it("writes one row per candidate, skills in one cell", () => {
    const [header, row] = candidatesToCsv([candidate]).split("\r\n");
    expect(header).toBe(
      "Name,Email,Phone,Headline,Years of experience,Skills,Resume URL,Registered,Profile ID",
    );
    expect(row).toBe(
      'Ayesha Khan,ayesha@example.com,,"Backend, data",5,python; sql,,2026-10-01T10:00:00Z,c1',
    );
  });
});

describe("csvFileName", () => {
  it("stamps the local date", () => {
    expect(csvFileName("candidates", new Date(2026, 0, 5))).toBe(
      "smarthire-candidates-2026-01-05.csv",
    );
  });
});
