import { describe, expect, it } from "vitest";
import {
  DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS,
  DATA_GRID_COPY_EXTRACTOR_DESCRIPTORS,
  DATA_GRID_DEFAULT_COPY_PREFERENCES,
  annotatedMetadataCell,
  annotatedTableHeader,
  normalizeDataGridCopyPreference,
  normalizeDataGridExtractorOptions,
  resolveDataGridCopyPreference,
  validateDataGridExtractorOptions,
} from "@/lib/dataGrid/dataGridCopyExtractor";

describe("data-grid extractor options", () => {
  it("keeps database qualification for legacy options and persists explicit opt-out", () => {
    expect(normalizeDataGridExtractorOptions({ sql: {} }).sql.includeDatabaseName).toBe(true);
    const configured = normalizeDataGridExtractorOptions({ sql: { includeDatabaseName: false } });
    expect(normalizeDataGridExtractorOptions(JSON.parse(JSON.stringify(configured))).sql.includeDatabaseName).toBe(false);
    expect(normalizeDataGridExtractorOptions({ sql: { includeDatabaseName: "false" } }).sql.includeDatabaseName).toBe(true);
  });

  it("defaults DSV NULL output to an empty spreadsheet field", () => {
    expect(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS.dsv.nullText).toBe("");
    expect(normalizeDataGridExtractorOptions({}).dsv.nullText).toBe("");
  });

  it("resolves smart copy to raw for one cell and TSV otherwise", () => {
    expect(normalizeDataGridCopyPreference(undefined)).toBe("smart");
    expect(normalizeDataGridCopyPreference("smart")).toBe("smart");
    expect(resolveDataGridCopyPreference("smart", 1)).toBe("raw");
    expect(resolveDataGridCopyPreference("smart", 2)).toBe("tsv");
    expect(resolveDataGridCopyPreference("csv", 1)).toBe("csv");
  });

  it("normalizes persisted values without sharing the default object", () => {
    const normalized = normalizeDataGridExtractorOptions(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);

    expect(normalized).toEqual(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    expect(normalized).not.toBe(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    expect(normalized.dsv).not.toBe(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS.dsv);
  });

  it("keeps camel-case JSON field names explicit and disabled by default", () => {
    expect(normalizeDataGridExtractorOptions({ json: {} }).json.camelCaseFieldNames).toBe(false);
    expect(normalizeDataGridExtractorOptions({ json: { camelCaseFieldNames: true } }).json.camelCaseFieldNames).toBe(true);
    expect(normalizeDataGridExtractorOptions({ json: { camelCaseFieldNames: "true" } }).json.camelCaseFieldNames).toBe(false);
  });

  it("rejects overlapping effective row and column separators", () => {
    const options = normalizeDataGridExtractorOptions(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    options.dsv.rowSeparator = ",";

    expect(validateDataGridExtractorOptions("csv", options)).toBe("separators-overlap");
  });

  it("rejects an empty custom separator before normalization can hide it", () => {
    const options = normalizeDataGridExtractorOptions(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    options.dsv.columnSeparator = "";

    expect(validateDataGridExtractorOptions("dsv", options)).toBe("column-separator-empty");
  });

  it("requires exactly one Unicode quote character", () => {
    const options = normalizeDataGridExtractorOptions(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    options.dsv.quote = "🙂";
    expect(validateDataGridExtractorOptions("one-row", options)).toBeNull();

    options.dsv.quote = "''";
    expect(validateDataGridExtractorOptions("one-row", options)).toBe("invalid-quote");
  });

  it("normalizes and validates separator and null-text limits by Unicode code point", () => {
    const columnSeparator = "🙂".repeat(5);
    const nullText = "🧊".repeat(40);
    const normalized = normalizeDataGridExtractorOptions({
      ...DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS,
      dsv: { ...DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS.dsv, columnSeparator, nullText },
    });

    expect(normalized.dsv.columnSeparator).toBe(columnSeparator);
    expect(normalized.dsv.nullText).toBe(nullText);
    expect(validateDataGridExtractorOptions("dsv", normalized)).toBeNull();
  });

  it("rejects quote conflicts, control quotes, and oversized values", () => {
    const options = normalizeDataGridExtractorOptions(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    options.dsv.quote = ",";
    expect(validateDataGridExtractorOptions("csv", options)).toBe("quote-conflicts");

    options.dsv.quote = "\n";
    expect(validateDataGridExtractorOptions("one-row", options)).toBe("invalid-quote");

    options.dsv.quote = '"';
    options.dsv.nullText = "x".repeat(65);
    expect(validateDataGridExtractorOptions("dsv", options)).toBe("null-text-too-long");
  });
});

describe("tsv-annotated", () => {
  it("writes `table（comment）` and degrades to whichever half exists", () => {
    expect(annotatedTableHeader("ポートフォリオ属性", "t_portfolio_attribute")).toBe("t_portfolio_attribute（ポートフォリオ属性）");
    expect(annotatedTableHeader(null, "t_users")).toBe("t_users");
    expect(annotatedTableHeader("ユーザー", undefined)).toBe("ユーザー");
    expect(annotatedTableHeader("   ", "  ")).toBe("");
    // The table comment is free text, so a full-width bracket inside it is kept as-is.
    expect(annotatedTableHeader("name（alt）", "t")).toBe("t（name（alt））");
  });

  it("collapses tabs and line breaks inside a metadata cell", () => {
    expect(annotatedMetadataCell("a\tb")).toBe("a b");
    expect(annotatedMetadataCell("a\nb\rc")).toBe("a b c");
    expect(annotatedMetadataCell(undefined)).toBe("");
  });

  it("is a delimited format that forces a tab separator and offers itself as a copy preference", () => {
    expect(DATA_GRID_COPY_EXTRACTOR_DESCRIPTORS["tsv-annotated"].category).toBe("delimited");
    expect(DATA_GRID_DEFAULT_COPY_PREFERENCES).toContain("tsv-annotated");

    // A configured separator that would overlap the row separator must not reach a
    // TSV-based format, which always joins columns with a tab.
    const options = normalizeDataGridExtractorOptions(DEFAULT_DATA_GRID_EXTRACTOR_OPTIONS);
    options.dsv.columnSeparator = "\n";
    expect(validateDataGridExtractorOptions("tsv-annotated", options)).toBeNull();
    expect(validateDataGridExtractorOptions("dsv", options)).toBe("separators-overlap");
  });
});
