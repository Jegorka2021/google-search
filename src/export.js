// Shared by the browser download and unit tests.
export function serializeExport(data) {
  return JSON.stringify(data, null, 2);
}
